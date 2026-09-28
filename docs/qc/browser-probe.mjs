// Run from the repository root. Creates only QC login sessions and local reports.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const origin = 'http://127.0.0.1:3000';
const output = 'test-results/qc-2026-09-25';
mkdirSync(output, { recursive: true });
const password = readFileSync('.secrets/bootstrap_admin_password', 'utf8').trim();
const routes = ['overview', 'inbox', 'contacts', 'compose', 'templates', 'outbox', 'handoffs',
  'agents', 'chatbot', 'ai-settings', 'knowledge', 'documents', 'ai-search',
  'ai-operations', 'ai-analytics', 'ai-readiness', 'session', 'safety'];
const endpoints = ['/overview', '/health/dependencies', '/session', '/safety/stats', '/audit',
  '/ai/integration', '/ai/provider-connections', '/ai/knowledge/categories', '/ai/knowledge',
  '/ai/documents', '/ai/prompts', '/ai/traces', '/ai/unanswered', '/ai/test-cases',
  '/ai/analytics', '/ai/release-readiness', '/ai/alerts', '/templates', '/contacts',
  '/conversations', '/outbox', '/handoffs', '/chatbot/config'];
const result = { at: new Date().toISOString(), origin, api: [], unauthenticated: [], pages: [] };
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const viewport of [{ width: 1440, height: 1200 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, locale: 'id-ID', colorScheme: 'dark' });
    const page = await context.newPage();
    const pageErrors = [];
    const failedRequests = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400 && response.url().includes('/api/admin/')) {
        failedRequests.push({ path: new URL(response.url()).pathname, status: response.status() });
      }
    });
    await page.goto(origin + '/login');
    await page.getByLabel('Username').fill('superadmin');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await page.waitForURL('**/overview');
    await page.locator('nav').waitFor();
    if (viewport.width === 1440) {
      for (const path of endpoints) {
        const response = await page.evaluate(async path => {
          const response = await fetch('/api/admin/v1' + path);
          return { status: response.status, body: await response.json() };
        }, path);
        const body = response.body;
        result.api.push({ path, status: response.status,
          arrayCount: Array.isArray(body.data) ? body.data.length : undefined,
          errorCode: body.error?.code,
          state: path === '/session' ? body.data?.state : undefined });
      }
      const unauth = await browser.newContext();
      for (const path of endpoints) {
        const response = await unauth.request.get(origin + '/api/admin/v1' + path);
        result.unauthenticated.push({ path, status: response.status() });
      }
      await unauth.close();
    }
    for (const route of routes) {
      pageErrors.length = 0;
      failedRequests.length = 0;
      const response = await page.goto(origin + '/' + route);
      if (response.status() === 200) {
        await page.locator('nav').waitFor();
        // Allow asynchronous data/React rendering without waiting on the persistent SSE request.
        await page.waitForTimeout(350);
      }
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      const overflow = await page.evaluate(() => {
        const width = window.innerWidth;
        return { width, documentWidth: document.documentElement.scrollWidth,
          elements: [...document.querySelectorAll('main *')]
            .filter(el => el.getBoundingClientRect().right > width + 1)
            .slice(0, 8).map(el => ({ tag: el.tagName, class: el.className })) };
      });
      const entry = { route, viewport, status: response.status(), overflow,
        pageErrors: [...pageErrors], failedRequests: [...failedRequests],
        violations: axe.violations.map(v => ({ id: v.id, impact: v.impact,
          targets: v.nodes.map(n => n.target) })) };
      result.pages.push(entry);
      console.log(JSON.stringify({ route, width: viewport.width, status: entry.status,
        a11y: entry.violations.length, errors: entry.pageErrors.length,
        failedRequests: entry.failedRequests, overflow: overflow.documentWidth > viewport.width }));
      if (['overview', 'session', 'agents'].includes(route)) {
        await page.screenshot({ path: `${output}/${viewport.width}-${route}.png`, fullPage: false });
      }
    }
    const logout = await page.evaluate(async () => {
      const me = await fetch('/api/admin/v1/me');
      const meBody = await me.json();
      if (!me.ok) return { status: me.status, phase: 'me' };
      const response = await fetch('/api/admin/v1/auth/logout', { method: 'POST',
        headers: { 'x-csrf-token': meBody.data.csrfToken, 'content-type': 'application/json' },
        body: '{}' });
      return { status: response.status, phase: 'logout' };
    });
    console.log(JSON.stringify({ logout, width: viewport.width }));
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync(`${output}/browser-probe.json`, JSON.stringify(result, null, 2) + '\n');
}
