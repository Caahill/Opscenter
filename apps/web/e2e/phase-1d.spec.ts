// Phase 1D acceptance criteria (docs/06_Build_Plan.md, PRD 2.1 to 2.5) on the fake Gmail, WhatsApp
// and classifier. Client messages come in through the dev simulator, which uses the same verified
// webhook paths as production. Every run uses its own subjects and senders.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAs, createClient, RUN, signIn } from './helpers';

const PM = 'pm@dev.local';
const MEMBER = 'member.seo@dev.local';

async function simulate(api: APIRequestContext, body: Record<string, unknown>) {
  const res = await api.post('/api/v1/dev/inbox/simulate', { data: body });
  expect(res.status(), await res.text()).toBe(201);
}

test('PRD 2.4: a client change request becomes a task with the original message attached, in 3 clicks', async ({ page }) => {
  const api = await apiAs(PM);
  const subject = `Footer number ${RUN}`;
  await simulate(api, { channel: 'EMAIL', from: 'priya@demo.example.com', subject, body: 'Hi team,\nPlease change the footer phone number on the website.\nThanks', attachmentName: `footer-${RUN}.pdf` });

  await signIn(page, PM);
  await page.goto('/inbox?view=triage');
  let clicks = 0;
  await page.getByTestId('thread-row').filter({ hasText: subject }).click();
  clicks++;
  const card = page.getByTestId('triage-card');
  await expect(card).toContainText('Change request');
  await card.getByRole('button', { name: 'Create task' }).click();
  clicks++;
  await page.getByRole('link', { name: 'Open the task' }).click();
  clicks++;
  expect(clicks).toBeLessThanOrEqual(3);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Change the footer phone number on the website');
  const original = page.getByRole('region', { name: 'Client message' });
  await expect(original).toContainText(subject);
  await expect(original).toContainText('priya@demo.example.com');
  await expect(page.getByText(`footer-${RUN}.pdf`).first()).toBeVisible();
});

test('PRD 2.1: a reply from Ops Hub and the client’s answer from their mail app land in one thread', async ({ page }) => {
  const api = await apiAs(PM);
  const subject = `Launch date ${RUN}`;
  await simulate(api, { channel: 'EMAIL', from: 'priya@demo.example.com', subject, body: 'When does the new site go live?' });

  await signIn(page, PM);
  await page.goto('/inbox');
  await page.getByTestId('thread-row').filter({ hasText: subject }).click();
  const reply = page.getByRole('form', { name: 'Reply' });
  await reply.getByLabel('Message').fill(`Next Monday ${RUN}.`);
  await reply.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('message').filter({ hasText: `Next Monday ${RUN}.` })).toBeVisible();

  // The client answers in Gmail (or any mail app): same thread.
  const threadKey = decodeURIComponent(new URL(page.url()).pathname.split('/').pop()!);
  await simulate(api, { channel: 'EMAIL', from: 'priya@demo.example.com', body: `Perfect, thanks ${RUN}`, threadKey });
  await page.reload();
  const messages = page.getByTestId('message');
  await expect(messages).toHaveCount(3);
  await expect(messages.nth(1)).toContainText(`Next Monday ${RUN}.`);
  await expect(messages.nth(2)).toContainText(`Perfect, thanks ${RUN}`);
  await expect(messages.nth(2)).toContainText(`Re: ${subject}`);
});

test('PRD 2.2: a 2023 email is found by client name and one keyword in under 10 seconds', async ({ page }) => {
  await signIn(page, PM);
  await page.goto('/search');
  const started = Date.now();
  await page.getByLabel('Search', { exact: true }).fill('Demo renewal');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByTestId('thread-row').filter({ hasText: 'SEO contract renewal 2023' })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(10_000);
});

test('PRD 2.5: a Team Member sees no client address or number in the UI, the page source or the API', async ({ page }) => {
  await signIn(page, MEMBER);
  await page.goto('/inbox/demo-thread-faq');
  await expect(page.getByTestId('message').first()).toContainText('Demo Co · Marketing contact');
  await expect(page.getByTestId('message-body').first()).toContainText('[phone hidden]');
  const html = await page.content();
  for (const secret of ['priya@demo.example.com', '98200', '@demo.example.com']) expect(html).not.toContain(secret);

  const api = await page.request.get('/api/v1/inbox/threads/demo-thread-faq');
  expect(api.ok()).toBe(true);
  const text = await api.text();
  for (const secret of ['priya@demo.example.com', '98200 12345', '9820012345']) expect(text).not.toContain(secret);
  // A thread not linked to their work does not exist for them.
  expect((await page.request.get('/api/v1/inbox/threads/demo-thread-banner')).status()).toBe(404);
});

test('PRD 2.3: an unknown sender waits in Unmatched until a PM links them to the client', async ({ page }) => {
  const api = await apiAs(PM);
  const subject = `Agency enquiry ${RUN}`;
  await simulate(api, { channel: 'EMAIL', from: `buyer.${RUN}@outlook.com`, subject, body: 'Can we talk about ads for next quarter?' });

  await signIn(page, PM);
  await page.goto('/inbox?view=unmatched');
  await page.getByTestId('thread-row').filter({ hasText: subject }).click();
  const form = page.getByRole('form', { name: 'Link to a client' });
  await form.getByLabel('Client', { exact: true }).selectOption({ label: 'Demo Co' });
  await form.getByLabel(/Save the sender as a contact/).check();
  await form.getByLabel('Contact name').fill(`Buyer ${RUN}`);
  await form.getByRole('button', { name: 'Link' }).click();
  await expect(page.getByRole('link', { name: 'Demo Co' }).first()).toBeVisible();
  await expect(page.getByTestId('triage-card')).toBeVisible();
});

test('PRD 2.7 Route B: a WhatsApp chat export is imported into the client’s inbox', async ({ page }) => {
  const api = await apiAs(PM);
  const client = await createClient(api, 'E2E WhatsApp');
  await signIn(page, PM);
  await page.goto('/inbox/import');
  await page.getByLabel('Client').selectOption({ label: client.companyName });
  await page.getByLabel('Chat export').setInputFiles({ name: 'WhatsApp Chat with Group.txt', mimeType: 'text/plain', buffer: readFileSync(resolve(process.cwd(), '../../fixtures/whatsapp/sample-export.txt')) });
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByRole('status')).toContainText('6 new messages');
  await page.getByRole('link', { name: 'Open the chat' }).click();
  await expect(page.getByTestId('message')).toHaveCount(6);
  await expect(page.getByTestId('message').first()).toContainText('please swap the homepage banner');
});

test('the inbox filters (channel and view chips) open without errors', async ({ page }) => {
  const api = await apiAs(PM);
  await simulate(api, { channel: 'WHATSAPP', from: '+91 98200 12345', body: `Chip check ${RUN}` });
  await signIn(page, PM);
  await page.goto('/inbox');
  await page.getByRole('link', { name: 'WhatsApp', exact: true }).click();
  await expect(page).toHaveURL(/channel=WHATSAPP/);
  await expect(page).not.toHaveURL(/undefined/);
  await expect(page.getByTestId('thread-row').filter({ hasText: `Chip check ${RUN}` })).toBeVisible();
  await expect(page.getByTestId('thread-row').filter({ hasText: 'Diwali banner' })).toHaveCount(0);
  for (const view of ['Needs triage', 'Unmatched', 'Sent', 'All']) {
    await page.getByRole('link', { name: view, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  }
  await page.getByTestId('thread-row').filter({ hasText: `Chip check ${RUN}` }).click();
  const reply = page.getByRole('form', { name: 'Reply' });
  await reply.getByLabel('Message').fill(`On it ${RUN}`);
  await reply.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('message').filter({ hasText: `On it ${RUN}` })).toBeVisible();
});

test("Accounts sees a client's follow-up in a billing thread straight away, before anyone triages it", async ({ page }) => {
  await signIn(page, 'accounts@dev.local');
  await page.goto('/inbox/demo-thread-renewal-2023');
  const box = page.getByRole('form', { name: "Simulate the client's reply" });
  await box.getByLabel('Client reply').fill(`Any news on the quote? ${RUN}`);
  await box.getByRole('button', { name: 'Deliver reply' }).click();
  await expect(page.getByTestId('message').filter({ hasText: `Any news on the quote? ${RUN}` })).toBeVisible();
  await expect(page.getByTestId('message').filter({ hasText: `Any news on the quote? ${RUN}` })).not.toContainText('billing@demo.example.com');
});

test('a new message is highlighted until the thread is opened, then looks like the rest', async ({ page }) => {
  const api = await apiAs(PM);
  const subject = `Highlight ${RUN}`;
  await simulate(api, { channel: 'EMAIL', from: 'priya@demo.example.com', subject, body: 'Please call back.' });
  await signIn(page, PM);
  await page.goto('/inbox');
  const row = page.getByTestId('thread-row').filter({ hasText: subject });
  await expect(row).toHaveAttribute('data-unread', 'true');
  await row.click();
  const message = page.getByTestId('message').filter({ hasText: 'Please call back.' });
  await expect(message).toHaveAttribute('data-unread', 'true');
  await expect(message.getByText('New', { exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.reload();
  await expect(page.getByTestId('message').filter({ hasText: 'Please call back.' })).not.toHaveAttribute('data-unread', 'true');
  await page.goto('/inbox');
  await expect(page.getByTestId('thread-row').filter({ hasText: subject })).not.toHaveAttribute('data-unread', 'true');
});
