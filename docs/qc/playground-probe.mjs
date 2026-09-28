// Bounded no-send QC: writes AI traces/usage through the existing playground, never an outbox message.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext();
const page = await context.newPage();
const output = 'test-results/qc-2026-09-25';
mkdirSync(output, { recursive: true });
const results = [];
try {
  await page.goto('http://127.0.0.1:3000/login');
  await page.getByLabel('Username').fill('superadmin');
  await page.getByLabel('Password', { exact: true }).fill(readFileSync('.secrets/bootstrap_admin_password', 'utf8').trim());
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL('**/overview');
  await page.locator('nav').waitFor();
  for (const question of ['Halo', 'Kamu siapa?', 'Apa itu gasotransmitter?', 'Apa itu gaso transmitter?',
    'Saya sesak napas dan nyeri dada', 'Tolong buatkan kode Python untuk website', 'Cabang terdekat?']) {
    const result = await page.evaluate(async question => {
      const me = await (await fetch('/api/admin/v1/me')).json();
      const response = await fetch('/api/admin/v1/ai/playground', { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': me.data.csrfToken },
        body: JSON.stringify({ question }), signal: AbortSignal.timeout(90000) });
      const body = await response.json();
      return { question, httpStatus: response.status, traceId: body.data?.id,
        status: body.data?.status, answer: body.data?.answer, shouldHandoff: body.data?.shouldHandoff,
        fallbackReason: body.data?.fallbackReason, citations: body.data?.sources?.length,
        latencyMs: body.data?.latencyMs, error: body.error?.code };
    }, question);
    results.push(result);
    console.log(JSON.stringify(result));
  }
} finally {
  try {
    await page.evaluate(async () => {
      const me = await (await fetch('/api/admin/v1/me')).json();
      if (!me.data) return;
      await fetch('/api/admin/v1/auth/logout', { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': me.data.csrfToken }, body: '{}' });
    });
  } finally {
    await browser.close();
    writeFileSync(`${output}/playground-probe.json`, JSON.stringify(results, null, 2) + '\n');
  }
}
