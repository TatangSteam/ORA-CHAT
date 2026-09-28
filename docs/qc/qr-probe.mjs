// UI-only QR lifecycle test: all API requests are fulfilled locally; no adapter actions.
import assert from 'node:assert/strict';

import { chromium } from '@playwright/test';

const origin = process.env.QC_WEB_ORIGIN ?? 'http://localhost:3000';
const qrPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64'
);
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext();
const page = await context.newPage();
let state = 'qr_required';
let actions = 0;
let qrRequests = 0;

try {
  await page.route('**/api/admin/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      actions += 1;
      return route.fulfill({ status: 409, json: { error: { code: 'QC_NO_ADAPTER_MUTATION' } } });
    }
    if (path.endsWith('/me')) {
      return route.fulfill({
        status: 200,
        json: {
          data: {
            id: '01988c36-6880-7000-8000-000000000001',
            username: 'qc-admin',
            displayName: 'QC Admin',
            tenant: {
              id: '01988c36-6880-7000-8000-000000000003',
              slug: 'qc',
              name: 'QC'
            },
            membership: { id: '01988c36-6880-7000-8000-000000000002', role: 'super_admin' },
            permissions: ['session.read', 'session.manage'],
            csrfToken: 'qc-csrf-token-with-at-least-thirty-two-characters'
          },
          meta: {}
        }
      });
    }
    if (path.endsWith('/session/qr')) {
      qrRequests += 1;
      return route.fulfill({ status: 200, contentType: 'image/png', body: qrPng });
    }
    if (path.endsWith('/session')) {
      return route.fulfill({
        status: 200,
        json: {
          data: {
            adapter: 'qc-mock',
            state,
            connectedAt: state === 'connected' ? new Date().toISOString() : null,
            lastHeartbeatAt: new Date().toISOString(),
            lastErrorCode: null,
            revision: 0,
            updatedAt: new Date().toISOString()
          },
          meta: {}
        }
      });
    }
    return route.fulfill({ status: 404, json: { error: { code: 'QC_NOT_MOCKED' } } });
  });

  await page.goto(`${origin}/session`);
  await page.clock.install();
  await page.getByRole('heading', { name: 'Menunggu QR', exact: true }).waitFor();
  const qr = page.getByAltText('QR untuk menautkan perangkat WhatsApp');
  await qr.waitFor();
  const firstQrUrl = await qr.getAttribute('src');

  await page.clock.fastForward(65_000);
  await page.waitForFunction((previousUrl) => {
    const image = document.querySelector('img[alt="QR untuk menautkan perangkat WhatsApp"]');
    return image?.getAttribute('src') !== previousUrl;
  }, firstQrUrl);
  const refreshedQrUrl = await qr.getAttribute('src');

  state = 'connected';
  await page.clock.fastForward(6_000);
  await page.getByRole('heading', { name: 'Terhubung', exact: true }).waitFor();
  const visibleAfterConnected = await qr.isVisible();

  assert.notEqual(refreshedQrUrl, firstQrUrl);
  assert.equal(visibleAfterConnected, false);
  assert.equal(actions, 0);
  assert.ok(qrRequests >= 2);
  console.log(
    JSON.stringify({
      check: 'qr_ui_lifecycle_mock',
      replacedAfterExpiry: true,
      visibleAfterConnected,
      qrRequests,
      adapterActions: actions
    })
  );
} finally {
  await browser.close();
}
