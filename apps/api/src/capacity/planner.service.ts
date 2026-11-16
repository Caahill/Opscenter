// TL weekly planner (PRD 1.6): a team's week, each member's assigned hours against available
// hours after leave, and batch moves of tasks between members, days and priorities.
import { Injectable } from '@nestjs/common';
import type { Prisma, Team } from '@opshub/db';
import { present, scopesFor, type Scope } from '@opshub/policy';
import { dayDate, shiftWeek, taskDay, weekDays, ymd, type PlannerMovesInput } from '@opshub/shared';
import { ActivityService } from '../common/activity.service';
import { Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../policy/scopes';
import { OPEN_STATUSES } from '../projects/projects.queries';
import { TasksQueries } from '../tasks/tasks.queries';
import { TasksService } from '../tasks/tasks.service';
import { PlannerDto, PlannerMovesDto, presentMemberCapacity, presentWarning } from '../people/dtos';
import { CapacityService, currentWeek, inWeekWhere, weekRange } from './capacity.service';

const OPEN = { in: [...OPEN_STATUSES] };

@Injectable()
export class PlannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ScopeService,
    private readonly capacity: CapacityService,
    private readonly tasks: TasksQueries,
    private readonly activity: ActivityService,
    private readonly tasksService: TasksService,
  ) {}

  /** The team inside the viewer's planner scope (TL: teams they lead or belong to), or 404. */
  private async requireTeam(v: AuthedViewer, scopes: Scope[], teamId: string): Promise<Team> {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw Errors.notFound('Team');
    if (!scopes.includes('ALL') && !(await this.scopes.teamIds(v)).includes(team.id)) throw Errors.notFound('Team');
    return team;
  }

  /** Active members, plus a leader who is not a member, so the TL can take work too. */
  private async memberIds(team: Team): Promise<string[]> {
    const members = await this.prisma.user.findMany({ where: { teamId: team.id, active: true }, select: { id: true } });
    const ids = members.map((m) => m.id);
    if (team.leaderId && !ids.includes(team.leaderId)) ids.push(team.leaderId);
    return ids;
  }

  /** Open tasks on a team's plan: assigned to a member, or unassigned and tagged to the team. */
  private teamTasks(team: Team, memberIds: string[]): Prisma.TaskWhereInput {
    return { statusType: OPEN, OR: [{ assigneeId: { in: memberIds } }, { assigneeId: null, teamId: team.id }] };
  }

  async view(v: AuthedViewer, scopes: Scope[], teamId: string, week = currentWeek()) {
    const team = await this.requireTeam(v, scopes, teamId);
    const memberIds = await this.memberIds(team);
    const start = weekRange(week).gte;
    // Task rows also pass the viewer's own task scope, so the planner never widens what they see.
    const taskScopes = scopesFor(v.roles, 'task.read');
    const [members, rows, backlog] = await Promise.all([
      this.capacity.members({ id: { in: memberIds } }, week),
      this.tasks.rows(v, taskScopes, { AND: [this.teamTasks(team, memberIds), inWeekWhere(week)] }, 300),
      this.tasks.rows(
        v,
        taskScopes,
        {
          AND: [
            this.teamTasks(team, memberIds),
            { OR: [{ plannedDate: null, dueDate: null }, { plannedDate: { lt: start } }, { plannedDate: null, dueDate: { lt: start } }] },
          ],
        },
        100,
      ),
    ]);
    const leaderFirst = members.sort((a, b) => Number(b.userId === team.leaderId) - Number(a.userId === team.leaderId));
    return present(PlannerDto, {
      teamId: team.id,
      teamName: team.name,
      department: team.department,
      week,
      prevWeek: shiftWeek(week, -1),
      nextWeek: shiftWeek(week, 1),
      days: weekDays(week),
      members: leaderFirst.map(presentMemberCapacity),
      tasks: await this.tasks.present(rows),
      backlog: await this.tasks.present(backlog),
    });
  }

  async moves(v: AuthedViewer, scopes: Scope[], teamId: string, input: PlannerMovesInput) {
    const team = await this.requireTeam(v, scopes, teamId);
    const members = new Set(await this.memberIds(team));
    const updateScopes = scopesFor(v.roles, 'task.update');
    const week = input.week ?? currentWeek();

    const planned: Array<{ task: Awaited<ReturnType<ScopeService['requireTask']>>; data: Prisma.TaskUncheckedUpdateInput }> = [];
    for (const m of input.moves) {
      const task = await this.scopes.requireTask(v, updateScopes, m.taskId);
      if (!(OPEN_STATUSES as readonly string[]).includes(task.statusType)) throw Errors.invalidState('Closed tasks cannot be planned');
      const onPlan = task.assigneeId ? members.has(task.assigneeId) : task.teamId === team.id;
      if (!onPlan) throw Errors.validation(`taskId: not on the ${team.name} plan`);
      if (m.assigneeId && !members.has(m.assigneeId)) throw Errors.validation(`assigneeId: must be in the ${team.name} team`);
      const data: Prisma.TaskUncheckedUpdateInput = {};
      if (m.assigneeId !== undefined) data.assigneeId = m.assigneeId;
      if (m.plannedDate !== undefined) data.plannedDate = m.plannedDate ? dayDate(m.plannedDate) : null;
      if (m.priority !== undefined) data.priority = m.priority;
      planned.push({ task, data });
    }

    await this.prisma.$transaction(async (tx) => {
      for (const { task, data } of planned) {
        await tx.task.update({ where: { id: task.id }, data });
        const from: Record<string, string | null> = {};
        const to: Record<string, string | null> = {};
        for (const [k, next] of Object.entries(data)) {
          const prev = (task as unknown as Record<string, unknown>)[k];
          const p = prev instanceof Date ? ymd(prev) : ((prev as string | null | undefined) ?? null);
          const n = next instanceof Date ? ymd(next) : ((next as string | null | undefined) ?? null);
          if (p !== n) {
            from[k] = p;
            to[k] = n;
          }
        }
        if (Object.keys(to).length) {
          await this.activity.log({ kind: 'TASK_PLANNED', actorId: v.userId, projectId: task.projectId, taskId: task.id, from, to }, tx);
        }
      }
    });

    for (const { task, data } of planned) {
      if (typeof data.assigneeId === 'string' && data.assigneeId !== task.assigneeId) await this.tasksService.notifyAssigned(v.userId, task.id);
    }

    // Warn about the people work landed on (PRD 3.3); the move itself is not blocked.
    const placements = planned
      .filter(({ data }) => data.assigneeId !== undefined || data.plannedDate !== undefined)
      .map(({ task, data }) => {
        const userId = (data.assigneeId !== undefined ? data.assigneeId : task.assigneeId) as string | null;
        const plannedDate = data.plannedDate !== undefined ? (data.plannedDate as Date | null) : task.plannedDate;
        return { userId, day: taskDay({ plannedDate, dueDate: task.dueDate }) };
      })
      .filter((p): p is { userId: string; day: string | null } => p.userId !== null);
    const warnings = await this.capacity.warnings(placements, week);

    return present(PlannerMovesDto, {
      planner: await this.view(v, scopes, team.id, week),
      warnings: warnings.map(presentWarning),
    });
  }
}
