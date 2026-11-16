// Phase 1B acceptance criteria (docs/06_Build_Plan.md, PRD 1.1 to 1.5).
import { expect, test } from '@playwright/test';
import { apiAs, createClient, createProject, signIn } from './helpers';

const PM = 'pm@dev.local';
const MEMBER = 'member.seo@dev.local';

test('PRD 1.1: a PM moves a project between stages and the move is logged', async ({ page }) => {
  const api = await apiAs(PM);
  // Earlier runs' cards would push this one off screen, and a drag cannot scroll.
  const stale = (await (await api.get('/api/v1/projects?department=WEB_DEV')).json()) as Array<{ id: string; clientName: string; statusType: string }>;
  for (const p of stale.filter((x) => x.clientName.startsWith('E2E Mover') && x.statusType !== 'STOPPED' && x.statusType !== 'DONE')) {
    await api.post(`/api/v1/projects/${p.id}/stop`, { data: { reason: 'SCOPE_CANCELLED', note: 'e2e cleanup' } });
  }
  const client = await createClient(api, 'E2E Mover');
  const project = await createProject(api, client.id, 'WEB_DEV', 'Website build');

  await signIn(page, PM);
  await page.goto(`/projects/${project.id}`);
  page.once('dialog', (d) => d.accept()); // the checklist is incomplete: confirm the logged override
  await page.getByRole('button', { name: 'Design (Figma)' }).click();
  await expect(page.locator('[aria-current="step"]')).toHaveText('Design (Figma)');
  await expect(page.getByText('moved from Requirements and sitemap to Design (Figma) (checklist override)')).toBeVisible();

  // The board drag does the same.
  await page.goto('/boards/WEB_DEV');
  const card = page.getByTestId('board-card').filter({ hasText: client.companyName });
  await card.dragTo(page.getByTestId('board-column').filter({ hasText: 'Client design approval' }));
  await expect(page.getByTestId('board-column').filter({ hasText: 'Client design approval' }).getByText(client.companyName)).toBeVisible();
  await api.post(`/api/v1/projects/${project.id}/stop`, { data: { reason: 'SCOPE_CANCELLED', note: 'e2e cleanup' } });
});

test('PRD 1.1: all 9 department boards are reachable', async ({ page }) => {
  await signIn(page, PM);
  await page.goto('/boards/SEO');
  const tabs = page.getByRole('navigation', { name: 'Departments' }).getByRole('link');
  await expect(tabs).toHaveCount(9);
});

test('PRD 1.2: a client with SEO, Google Ads and AMC shows all three on one page', async ({ page }) => {
  await signIn(page, PM);
  await page.goto('/clients?search=Demo%20Co');
  await page.getByRole('link', { name: 'Demo Co', exact: true }).click();
  const projects = page.getByTestId('client-project');
  await expect(projects.filter({ hasText: 'SEO' })).toHaveCount(1);
  await expect(projects.filter({ hasText: 'Google Ads' })).toHaveCount(1);
  await expect(projects.filter({ hasText: 'AMC' })).toHaveCount(1);
});

test('PRD 1.3: hand-off creates the receiving projects with no manual copying', async ({ page }) => {
  const api = await apiAs(PM);
  const client = await createClient(api, 'E2E Handoff');
  const onboarding = await createProject(api, client.id, 'ONBOARDING', 'Client onboarding');

  await signIn(page, PM);
  await page.goto(`/projects/${onboarding.id}`);
  await page.getByRole('checkbox', { name: 'SEO' }).check();
  await page.getByRole('checkbox', { name: 'Google Ads' }).check();
  await page.getByRole('button', { name: /Hand off to 2 departments/ }).click();
  await expect(page.locator('[aria-current="step"]')).toHaveText('Handed over');
  await expect(page.getByText('handed off from here')).toHaveCount(2);
});

test('PRD 1.4: starting a project from a package creates its setup tasks', async ({ page }) => {
  const api = await apiAs(PM);
  const client = await createClient(api, 'E2E Package');

  await signIn(page, PM);
  await page.goto(`/clients/${client.id}`);
  await page.getByRole('button', { name: 'Start a project' }).click();
  await page.getByLabel('Department').selectOption('SOCIAL_MEDIA');
  await page.getByLabel('Package').selectOption({ label: 'Social 12 posts a month' });
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/projects\//);
  await expect(page.getByRole('link', { name: 'Collect brand kit and page access' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Content strategy' })).toBeVisible();
});

test('PRD 1.5: a Team Member updates status and progress from My tasks in two clicks or fewer', async ({ page }) => {
  await signIn(page, MEMBER);
  await page.goto('/my-tasks?range=week');
  const row = page.getByTestId('my-task').first();
  const title = (await row.getByRole('link').first().textContent())!;

  // Status: open the select and pick a value, which is two clicks for a person.
  await row.getByLabel('Status').selectOption('WAITING_ON_CLIENT');
  await expect(row.getByLabel('Status')).toHaveValue('WAITING_ON_CLIENT');
  // Progress: one click.
  await row.getByRole('button', { name: '75%' }).click();
  await expect(row.getByRole('button', { name: '75%' })).toHaveAttribute('aria-pressed', 'true');

  const api = await apiAs(MEMBER);
  const tasks = (await (await api.get('/api/v1/me/tasks?range=week')).json()) as Array<{ id: string; title: string; statusType: string; progressPct: number }>;
  const updated = tasks.find((t) => t.title === title);
  expect(updated).toMatchObject({ statusType: 'WAITING_ON_CLIENT', progressPct: 75 });
  // Put it back so reruns start from the same state.
  await api.patch(`/api/v1/tasks/${updated!.id}`, { data: { statusType: 'ACTIVE' } });
});

test('masking in the UI: a Team Member sees labels, never Demo Co contact details', async ({ page }) => {
  await signIn(page, MEMBER);
  await page.goto('/clients?search=Demo%20Co');
  await page.getByRole('link', { name: 'Demo Co', exact: true }).click();
  await expect(page.getByText('Demo Co · Marketing contact').first()).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain('priya@demo.example.com');
  expect(html).not.toContain('98200 12345');
  expect(html).not.toContain('Hunter2');
});
