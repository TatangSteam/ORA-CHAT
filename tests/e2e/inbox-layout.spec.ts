import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ baseURL: process.env['INBOX_TEST_ORIGIN'] ?? 'http://localhost:3000' });

test.beforeEach(async ({ page }) => {
  const conversations = Array.from({ length: 25 }, (_, index) => ({
    id: `c-${index}`,
    status: 'open',
    handlingMode: 'human',
    unreadCount: index % 3,
    followUpRequired: false,
    lastMessageAt: '2026-11-17T01:00:00Z',
    contact: {
      id: `contact-${index}`,
      displayName: `Pelanggan ${index + 1}`,
      normalizedPhone: '6281234567890',
      maskedPhone: '6281•••890',
      consentStatus: 'unknown'
    },
    lastMessage: { content: 'Saya ingin menanyakan jadwal konsultasi.' },
    activeHandoff: null
  }));
  const messages = Array.from({ length: 30 }, (_, index) => ({
    id: `m-${index}`,
    direction: index % 2 ? 'outgoing' : 'incoming',
    source: 'admin',
    status: 'sent',
    content: `Pesan ${index + 1}: Mohon informasi jadwal konsultasi dan layanan yang tersedia.`,
    occurredAt: '2026-11-17T01:00:00Z'
  }));
  await page.route('**/api/admin/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/admin/v1', '');
    let data: unknown = [];
    if (path === '/me')
      data = {
        id: 'admin',
        displayName: 'Admin',
        tenant: { id: 'tenant', name: 'RAHO Test' },
        membership: { role: 'super_admin' },
        permissions: ['messages.read', 'messages.send', 'handoffs.manage', 'session.read'],
        csrfToken: 'test'
      };
    if (path === '/session') data = { state: 'connected' };
    if (path === '/conversations') data = conversations;
    if (/^\/conversations\/c-\d+\/messages$/u.test(path))
      data = { conversation: conversations[0], messages: messages.toReversed() };
    await route.fulfill({ json: { data, meta: { requestId: 'inbox-test' } } });
  });
});

for (const viewport of [
  { width: 1920, height: 960 },
  { width: 1366, height: 768 },
  { width: 1280, height: 600 }
]) {
  test(`chat and reply remain usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/inbox');
    const timeline = page.getByLabel('Timeline pesan', { exact: true });
    await expect(timeline.getByText(/^Pesan 30:/u)).toBeVisible();
    await expect(page.locator('.inbox-layout .section-help')).toHaveCount(0);
    const send = page.getByRole('button', { name: 'Kirim lewat outbox', exact: true });
    await expect(send).toBeInViewport();
    await expect(
      page.getByRole('textbox', { name: 'Balasan manual', exact: true })
    ).toBeInViewport();
    const timelineBounds = await timeline.boundingBox();
    expect(timelineBounds!.height).toBeGreaterThanOrEqual(120);
    const listBounds = await page.locator('.conversation-list .list-stack').boundingBox();
    expect(listBounds!.height).toBeGreaterThanOrEqual(150);
    const firstRow = await page.locator('.conversation-list .list-row').nth(0).boundingBox();
    const secondRow = await page.locator('.conversation-list .list-row').nth(1).boundingBox();
    expect(firstRow!.height).toBeGreaterThanOrEqual(80);
    expect(firstRow!.y + firstRow!.height).toBeLessThanOrEqual(secondRow!.y);
    expect(
      await page
        .locator('#main-content')
        .evaluate((element) => element.scrollHeight <= element.clientHeight + 1)
    ).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    await page
      .getByRole('textbox', { name: 'Balasan manual', exact: true })
      .fill('Baik, saya bantu periksa jadwalnya.');
    await page.screenshot({
      path: `test-results/inbox-layout-${viewport.width}.png`,
      fullPage: false
    });
  });
}

test('mobile keeps the reply reachable and the guidebook accessible @a11y', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/inbox');
  await expect(page.locator('.conversation-list .list-row').first()).toBeVisible();
  const mobileList = await page.locator('.conversation-list .list-stack').boundingBox();
  expect(mobileList!.height).toBeGreaterThanOrEqual(80);
  const reply = page.getByRole('textbox', { name: 'Balasan manual', exact: true });
  await reply.scrollIntoViewIfNeeded();
  await expect(reply).toBeInViewport();
  await expect(page.getByRole('link', { name: 'Baca panduan', exact: true })).toHaveAttribute(
    'href',
    '/guidebook#fitur-inbox'
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(result.violations).toEqual([]);
  await page.screenshot({ path: 'test-results/inbox-layout-mobile.png', fullPage: false });
});
