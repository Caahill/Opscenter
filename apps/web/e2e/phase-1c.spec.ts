// Phase 1C acceptance criteria (docs/06_Build_Plan.md, PRD 1.6 and 3.1 to 3.3). Each run adds two
// SEO team members of its own and works in next week; afterwards it closes its tasks and
// deactivates them, so reruns on the e2e database start from the same picture.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { apiAs, createClient, createProject, RUN, signIn } from './helpers';

const HR = 'hr@dev.local';
const TL = 'tl.seo@dev.local';
const PM = 'pm@dev.local';
const ADMIN = 'admin@dev.local';
const NAME = `E2E Member ${RUN}`;
const HELPER = `E2E Helper ${RUN}`;

// Next week, Monday first, in UTC dates (the API stores date-only values at UTC midnight).
const now = new Date();
const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7) + 7));
const day = (n: number) => new Date(monday.getTime() + n * 86_400_000).toISOString().slice(0, 10);
function isoWeek(d: Date): string {
  const thursday = new Date(d.getTime() + 3 * 86_400_000);
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return `${thursday.getUTCFullYear()}-W${String(Math.floor((thursday.getTime() - jan1) / 86_400_000 / 7) + 1).padStart(2, '0')}`;
}
const WEEK = isoWeek(monday);

let admin: APIRequestContext;
let pm: APIRequestContext;
let seoTeamId: string;
let memberId: string;
let helperId: string;
let projectId: string;
const created: string[] = [];

const row = (page: Page, person: string) => page.locator(`[data-testid="planner-row"][data-person="${person}"]`);
const cell = (page: Page, person: string, date: string) => row(page, person).locator(`[data-testid="planner-cell"][data-day="${date}"]`);

async function newTask(title: string, due: string, estimateH: number, assigneeId = memberId) {
  const res = await pm.post('/api/v1/tasks', { data: { projectId, title: `${title} ${RUN}`, assigneeId, dueDate: due, estimateH } });
  expect(res.status(), await res.text()).toBe(201);
  const task = (await res.json()) as { id: string; title: string };
  created.push(task.id);
  return task;
}

async function teamMember(name: string, local: string) {
  const res = await admin.post('/api/v1/users', { data: { email: `${local}.${RUN}@dev.local`, name, roles: ['TEAM_MEMBER'], teamId: seoTeamId } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test.use({ viewport: { width: 1440, height: 1000 } });

test.describe.serial('Phase 1C: leave, capacity and the weekly planner', () => {
  test.beforeAll(async () => {
    admin = await apiAs(ADMIN);
    pm = await apiAs(PM);
    const teams = (await (await admin.get('/api/v1/teams')).json()) as Array<{ id: string; name: string }>;
    seoTeamId = teams.find((t) => t.name === 'SEO')!.id;
    memberId = await teamMember(NAME, 'e2e.member');
    helperId = await teamMember(HELPER, 'e2e.helper');
    const client = await createClient(pm, 'E2E Planner');
    projectId = (await createProject(pm, client.id, 'SEO')).id;
  });

  test.afterAll(async () => {
    for (const id of created) await pm.patch(`/api/v1/tasks/${id}`, { data: { statusType: 'DONE' } });
    for (const id of [memberId, helperId]) await admin.patch(`/api/v1/users/${id}`, { data: { active: false } });
  });

  test('PRD 3.1: leave entered by HR shows on the planner and capacity straight away', async ({ browser }) => {
    await newTask('Due during leave', day(1), 4);
    await newTask('Also during leave', day(2), 3);

    const hrPage = await (await browser.newContext()).newPage();
    await signIn(hrPage, HR);
    await hrPage.goto('/leave');
    await hrPage.getByLabel('Person').selectOption({ label: NAME });
    await hrPage.getByLabel('From').fill(day(1));
    await hrPage.getByLabel('To').fill(day(2));
    await hrPage.getByPlaceholder(/Reason/).fill('Family wedding');
    const started = Date.now();
    await hrPage.getByRole('button', { name: 'Record leave' }).click();
    await expect(hrPage.getByRole('status')).toContainText(`Recorded for ${NAME}`);

    const tlPage = await (await browser.newContext()).newPage();
    await signIn(tlPage, TL);
    await tlPage.goto(`/planner/${seoTeamId}?week=${WEEK}`);
    await expect(cell(tlPage, NAME, day(1)).getByText('On leave')).toBeVisible();
    await expect(cell(tlPage, NAME, day(2)).getByText('On leave')).toBeVisible();
    await expect(row(tlPage, NAME).getByText('Leave 2d')).toBeVisible();
    // 40 h over 6 days: two days of leave leave 26.7 h.
    await expect(row(tlPage, NAME).getByText('7h of 26.7h')).toBeVisible();

    await tlPage.goto(`/capacity?week=${WEEK}`);
    const capacityRow = tlPage.getByTestId('capacity-member').filter({ hasText: NAME });
    await expect(capacityRow).toContainText('26.7h');
    expect(Date.now() - started).toBeLessThan(60_000);

    // The Team Leader never sees the reason.
    await tlPage.goto('/leave');
    await expect(tlPage.getByTestId('leave-row').filter({ hasText: NAME })).toBeVisible();
    await expect(tlPage.getByText('Family wedding')).toHaveCount(0);
  });

  test('PRD 1.6: a TL rebalances a member on leave without leaving the planner', async ({ page }) => {
    await signIn(page, TL);
    await page.goto(`/planner/${seoTeamId}?week=${WEEK}`);
    const card = cell(page, NAME, day(1)).getByTestId('planner-card').filter({ hasText: `Due during leave ${RUN}` });
    await expect(card.getByText('During leave', { exact: true })).toBeVisible();

    await card.dragTo(cell(page, HELPER, day(1)));
    await expect(cell(page, HELPER, day(1)).getByText(`Due during leave ${RUN}`)).toBeVisible();
    await expect(cell(page, NAME, day(1)).getByText(`Due during leave ${RUN}`)).toHaveCount(0);

    // The keyboard route: Move sets person, day and priority in one go.
    const second = cell(page, NAME, day(2)).getByTestId('planner-card').filter({ hasText: `Also during leave ${RUN}` });
    await second.getByRole('button', { name: 'Move' }).click();
    const form = page.getByRole('form', { name: `Move Also during leave ${RUN}` });
    await form.getByLabel('Person').selectOption(helperId);
    await form.getByLabel('Day').selectOption(day(3));
    await form.getByLabel('Priority').selectOption('URGENT');
    await form.getByRole('button', { name: 'Save' }).click();
    const moved = cell(page, HELPER, day(3)).getByTestId('planner-card').filter({ hasText: `Also during leave ${RUN}` });
    await expect(moved.getByText('Urgent')).toBeVisible();

    await page.reload();
    await expect(cell(page, HELPER, day(1)).getByText(`Due during leave ${RUN}`)).toBeVisible();
    await expect(row(page, NAME).getByText('0h of 26.7h')).toBeVisible();
  });

  test('PRD 3.2: the leave alert lists tasks due during the leave, reassigned in one click', async ({ page }) => {
    // Recorded after the leave, so it reaches the alert page through its live task list.
    await newTask('Late addition', day(2), 2);
    await signIn(page, TL);
    await page.goto('/notifications');
    await page.getByTestId('alert').getByRole('button', { name: new RegExp(`${NAME} is on leave`) }).click();
    await page.waitForURL(/\/leave\//);
    const taskRow = page.getByTestId('impact-task').filter({ hasText: `Late addition ${RUN}` });
    await expect(taskRow.getByRole('combobox')).not.toHaveValue('');
    await taskRow.getByRole('button', { name: 'Reassign' }).click();
    await expect(page.getByTestId('impact-task').filter({ hasText: `Late addition ${RUN}` })).toHaveCount(0);
  });

  test('PRD 3.3: assigning a task to an over-capacity member shows a warning', async ({ page }) => {
    await newTask('Big push', day(0), 30);
    const other = await newTask('Needs an owner', day(4), 2, (await (await pm.get('/api/v1/me')).json()).id);
    await signIn(page, PM);
    await page.goto(`/tasks/${other.id}`);
    await page.getByLabel('Assignee').selectOption({ label: NAME });
    await expect(page.getByRole('status').filter({ hasText: 'over capacity' })).toContainText(`${NAME} is over capacity in week ${Number(WEEK.slice(6))}`);
  });
});
