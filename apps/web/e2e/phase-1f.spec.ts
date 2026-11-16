// Phase 1F acceptance (docs/06_Build_Plan.md, PRD 5.1 to 5.5, 6.1, 6.2): live chat with mentions
// and masking, live alerts, notification settings and the role dashboards on Home.
import { expect, test } from '@playwright/test';
import { apiAs, RUN, signIn } from './helpers';

const PM = 'pm@dev.local';
const MEMBER = 'member.seo@dev.local';
const ADMIN = 'admin@dev.local';
const HR = 'hr@dev.local';

test('PRD 5.1 and 5.2: a direct message arrives live, mentions alert the person, pasted numbers are hidden', async ({ browser }) => {
  const pm = await (await browser.newContext()).newPage();
  await signIn(pm, PM);
  await pm.goto('/chat');
  await pm.getByLabel('Message a colleague').selectOption({ label: 'Manoj Member' });
  await pm.getByRole('button', { name: 'Open chat' }).click();
  await pm.waitForURL(/\/chat\/[^/]+$/);
  await expect(pm.getByRole('heading', { name: 'Manoj Member' })).toBeVisible();
  const channelUrl = pm.url();

  const member = await (await browser.newContext()).newPage();
  await signIn(member, MEMBER);
  await member.goto(channelUrl);
  await expect(member.getByRole('heading', { name: 'Pavan PM' })).toBeVisible();

  // The PM mentions Manoj through the typeahead and pastes a client number.
  const box = pm.getByLabel('Message', { exact: true });
  await box.fill(`Hi ${RUN}, @Mano`);
  await pm.getByRole('option', { name: /Manoj Member/ }).click();
  await box.pressSequentially('the client says call +91 98200 55555');
  await pm.getByRole('button', { name: 'Send' }).click();
  await expect(pm.getByTestId('chat-message').last()).toContainText('@Manoj Member');

  // Manoj sees it without reloading, with the number hidden, and gets an alert.
  const msg = member.getByTestId('chat-message').filter({ hasText: RUN });
  await expect(msg).toBeVisible();
  await expect(msg).toContainText('[phone hidden]');
  await expect(msg).not.toContainText('98200 55555');
  await expect(member.getByTestId('toast')).toContainText('Pavan PM mentioned you in a direct message');

  // Manoj replies; the PM sees it live too.
  await member.getByLabel('Message', { exact: true }).fill(`On it ${RUN}`);
  await member.getByLabel('Message', { exact: true }).press('Enter');
  await expect(pm.getByTestId('chat-message').filter({ hasText: `On it ${RUN}` })).toBeVisible();
});

test('PRD 5.3: a client message alerts its PM live, and the inbox updates without reloading', async ({ page }) => {
  await signIn(page, PM);
  await page.goto('/inbox');
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  const admin = await apiAs(ADMIN);
  const res = await admin.post('/api/v1/dev/inbox/simulate', { data: { channel: 'EMAIL', threadKey: 'demo-thread-banner', body: `Live check ${RUN}: one more change please` } });
  expect(res.status()).toBe(201);
  await expect(page.getByTestId('toast')).toContainText('New email from Demo Co');
  await expect(page.getByTestId('thread-row').filter({ hasText: `Live check ${RUN}` })).toBeVisible();
});

test('PRD 5.3: notification settings save per category, and a test alert arrives', async ({ page }) => {
  await signIn(page, MEMBER);
  await page.goto('/settings/notifications');
  const mention = page.getByLabel('Mentions in chat: email');
  const was = await mention.isChecked();
  await mention.setChecked(!was);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Mentions in chat: email')).toBeChecked({ checked: !was });
  await expect(page.getByLabel('Mentions in chat: in app (always on)')).toBeDisabled();

  await page.getByRole('button', { name: 'Send me a test' }).click();
  await expect(page.getByTestId('toast')).toContainText('Notifications are working');

  // The dev outbox sends the digest now.
  await page.getByRole('button', { name: 'Send the digest now' }).click();
  await expect(page.getByText(/Digest sent to \d+/)).toBeVisible();
  await expect(page.getByTestId('outbox-mail').first()).toContainText(/Ops Hub: \d+ updates? for you/);
});

test('PRD 6.1 and 6.2: Home shows each role its own dashboards', async ({ browser }) => {
  const as = async (email: string) => {
    const page = await (await browser.newContext()).newPage();
    await signIn(page, email);
    return page;
  };
  const admin = await as(ADMIN);
  await expect(admin.getByTestId('dashboard-admin')).toBeVisible();
  await expect(admin.getByTestId('dashboard-admin').getByTestId('team-load').first()).toBeVisible();

  const pm = await as(PM);
  await expect(pm.getByTestId('dashboard-pm')).toBeVisible();
  await expect(pm.getByTestId('dashboard-me')).toBeVisible();
  await expect(pm.getByTestId('dashboard-admin')).toHaveCount(0);

  const member = await as(MEMBER);
  await expect(member.getByTestId('dashboard-me')).toBeVisible();
  await expect(member.getByTestId('dashboard-pm')).toHaveCount(0);

  const hr = await as(HR);
  await expect(hr.getByTestId('dashboard-hr')).toBeVisible();
  await expect(hr.getByTestId('dashboard-pm')).toHaveCount(0);
  await expect(hr.getByText('Demo Co')).toHaveCount(0);
});
