import type { PrismaClient } from '@prisma/client';
import { SEED_HOLIDAYS, SEED_TEAMS, SEED_USERS } from './seed-data';

/** Idempotent: teams per department, one user per role and office holidays. Used by `pnpm db:seed` and API tests. */
export async function seedBase(prisma: PrismaClient): Promise<{ teams: number; users: number }> {
  const teams = new Map<string, string>();
  for (const t of SEED_TEAMS) {
    // Match on name too: Admin may add more teams to a department.
    const existing = await prisma.team.findFirst({ where: { department: t.department, name: t.name } });
    const team = existing ?? (await prisma.team.create({ data: t }));
    teams.set(t.department, team.id);
  }

  for (const u of SEED_USERS) {
    const teamId = u.team ? (teams.get(u.team) ?? null) : null;
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, roles: u.roles, teamId, active: true },
      create: { email: u.email, name: u.name, roles: u.roles, teamId },
    });
    if (u.leadsTeam && teamId) {
      await prisma.team.update({ where: { id: teamId }, data: { leaderId: user.id } });
    }
  }

  for (const h of SEED_HOLIDAYS) {
    const date = new Date(`${h.date}T00:00:00.000Z`);
    await prisma.holiday.upsert({
      where: { date_location: { date, location: h.location } },
      update: {},
      create: { date, location: h.location, name: h.name },
    });
  }

  return { teams: SEED_TEAMS.length, users: SEED_USERS.length };
}
