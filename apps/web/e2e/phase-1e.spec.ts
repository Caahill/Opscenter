// Phase 1E acceptance criteria (docs/06_Build_Plan.md, PRD 4.1 to 4.4). Each test makes its own
// client, so reruns on the e2e database do not collide.
import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAs, createClient, createProject, RUN, signIn } from './helpers';

const PM = 'pm@dev.local';
const MEMBER = 'member.seo@dev.local';
const ACCOUNTS = 'accounts@dev.local';

async function memberTask(api: APIRequestContext, projectId: string, title: string) {
  const member = await apiAs(MEMBER);
  const me = (await (await member.get('/api/v1/me')).json()) as { id: string };
  const res = await api.post('/api/v1/tasks', { data: { projectId, title, assigneeId: me.id } });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string };
}

test('PRD 4.1 and 4.2: a confirmed billable task cannot close until a billing request lists it', async ({ browser }) => {
  const api = await apiAs(PM);
  const client = await createClient(api, 'E2E Billable');
  const project = await createProject(api, client.id, 'SEO');
  const title = `Extra landing page ${RUN}`;
  const task = await memberTask(api, project.id, title);

  const member = await (await browser.newContext()).newPage();
  await signIn(member, MEMBER);
  await member.goto(`/tasks/${task.id}`);
  await member.getByRole('button', { name: 'Flag as extra work' }).click();
  await expect(member.getByTestId('billable')).toContainText('Flagged as extra work');

  const pm = await (await browser.newContext()).newPage();
  await signIn(pm, PM);
  await pm.goto(`/tasks/${task.id}`);
  await pm.getByRole('button', { name: 'Confirm billable' }).click();
  await expect(pm.getByTestId('billable')).toContainText('Billable, confirmed');

  // Closing is refused while nothing bills it.
  await member.reload();
  await member.getByLabel('Status').selectOption('DONE');
  await expect(member.getByText(/confirmed as billable/)).toBeVisible();

  await pm.getByRole('link', { name: 'Raise one' }).click();
  const form = pm.getByRole('form', { name: 'Raise billing request' });
  await expect(form.getByRole('checkbox', { name: title })).toBeChecked();
  await form.getByLabel('Description').fill('Landing page outside the package');
  await form.getByLabel('Amount').fill('9500');
  await form.getByRole('button', { name: 'Send to Accounts' }).click();
  await expect(pm.locator('#billing').getByText('Requested')).toBeVisible();

  await member.reload();
  await member.getByLabel('Status').selectOption('DONE');
  await expect(member.getByLabel('Status')).toHaveValue('DONE');
  await expect(member.getByText(/confirmed as billable/)).toHaveCount(0);
});

test('PRD 4.4: Accounts invoices and records payment, messages the PM, and never sees the project value', async ({ page }) => {
  const api = await apiAs(PM);
  const client = await createClient(api, 'E2E Accounts');
  const project = await createProject(api, client.id, 'GOOGLE_ADS');
  await api.patch(`/api/v1/projects/${project.id}`, { data: { value: '76543.00' } });
  const created = await api.post('/api/v1/billing-requests', { data: { projectId: project.id, reason: 'NEW_PACKAGE', description: `Ads setup ${RUN}`, amount: '8800' } });
  expect(created.status()).toBe(201);

  await signIn(page, ACCOUNTS);
  await page.goto('/billing');
  await page.getByTestId('billing-row').filter({ hasText: client.companyName }).click();
  await expect(page.getByTestId('billing-amount')).toHaveText('INR 8,800.00');
  for (const value of ['76543', '76,543']) expect(await page.content()).not.toContain(value);

  await page.getByLabel('Invoice number').fill(`INV-${RUN}`);
  await page.getByRole('button', { name: 'Mark invoiced' }).click();
  await expect(page.getByText(`INV-${RUN}`).first()).toBeVisible();
  await page.getByRole('button', { name: 'Mark paid' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();

  await page.getByLabel('Message text').fill(`Payment received, thanks ${RUN}`);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('billing-message').filter({ hasText: `Payment received, thanks ${RUN}` })).toBeVisible();

  // The project page is reachable for Accounts through the request, still without its value.
  await page.goto(`/projects/${project.id}`);
  expect(await page.content()).not.toContain('76543');
  await expect(page.getByText('Hidden for your role').first()).toBeVisible();
});

test('PRD 4.3: the PM renews a retainer from Renewals due, and Accounts gets the billing request', async ({ browser }) => {
  const api = await apiAs(PM);
  const client = await createClient(api, 'E2E Renewal');
  const project = await createProject(api, client.id, 'AMC');
  const end = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
  expect((await api.patch(`/api/v1/projects/${project.id}`, { data: { endDate: end } })).ok()).toBe(true);

  const pm = await (await browser.newContext()).newPage();
  await signIn(pm, PM);
  await pm.goto('/billing?tab=renewals');
  const row = pm.getByTestId('renewal-row').filter({ hasText: client.companyName });
  await expect(row).toContainText(/(19|20) days left/);
  await row.getByRole('button', { name: 'Renew' }).click();
  await row.getByLabel('Renewal amount').fill('60000');
  await row.getByRole('button', { name: 'Renew and bill' }).click();
  await expect(pm.getByTestId('renewal-row').filter({ hasText: client.companyName })).toHaveCount(0);

  const accounts = await (await browser.newContext()).newPage();
  await signIn(accounts, ACCOUNTS);
  await accounts.goto('/billing');
  const request = accounts.getByTestId('billing-row').filter({ hasText: client.companyName });
  await expect(request).toContainText('Renewal');
  await expect(request).toContainText('INR 60,000.00');
});
