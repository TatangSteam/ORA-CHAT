import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const origin =
  process.env['SHELL_TEST_ORIGIN']?.trim() ||
  process.env['AI_SETTINGS_TEST_ORIGIN']?.trim() ||
  'http://localhost:3000';
const permissions = [
  'overview.read',
  'messages.read',
  'messages.send',
  'messages.retry',
  'contacts.read',
  'handoffs.read',
  'handoffs.manage',
  'chatbot.read',
  'chatbot.manage',
  'knowledge.read',
  'knowledge.manage',
  'knowledge.publish',
  'ai.settings.manage',
  'ai.activate',
  'ai.analytics.read',
  'templates.read',
  'templates.manage',
  'session.read',
  'session.manage',
  'safety.read',
  'safety.manage',
  'safety.reset',
  'audit.read'
];

const mockShell = async (page: Page) => {
  const unexpected: string[] = [];
  await page.route('**/api/admin/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/admin/v1', '');
    const respond = (data: unknown) =>
      route.fulfill({ json: { data, meta: { requestId: 'shell-layout-test' } } });
    if (path === '/me') {
      return respond({
        id: 'shell-user',
        username: 'shell-test',
        displayName: 'Administrator Test',
        tenant: { id: 'shell-tenant', slug: 'shell-test', name: 'RAHO Test' },
        membership: { id: 'shell-membership', role: 'super_admin' },
        permissions,
        csrfToken: 'shell-test-csrf'
      });
    }
    if (path === '/session') return respond({ state: 'connected' });
    if (path === '/ai/integration') {
      return respond({
        activeChatConnectionId: 'shell-connection',
        activeEmbeddingConnectionId: null,
        generationEnabled: true,
        retrievalEnabled: false,
        status: 'ready',
        revision: 7
      });
    }
    if (path === '/ai/provider-connections') {
      return respond([
        {
          id: 'shell-connection',
          name: 'Gemini produksi',
          purpose: 'chat',
          provider: 'gemini',
          transport: 'native',
          baseUrl: null,
          modelId: 'gemini-live',
          dimensions: null,
          taskType: null,
          timeoutMs: 15000,
          maxRetries: 1,
          maxOutputTokens: 512,
          generationConfig: {},
          healthState: 'ready',
          lastTestedAt: '2026-11-12T01:00:00.000Z',
          testedRevision: 3,
          revision: 3,
          credentialConfigured: true,
          credentialRotatedAt: '2026-11-12T01:00:00.000Z'
        }
      ]);
    }
    unexpected.push(`${route.request().method()} ${path}`);
    return route.fulfill({
      status: 500,
      json: { error: { code: 'UNEXPECTED_TEST_REQUEST', message: 'Unexpected mocked request.' } }
    });
  });
  return unexpected;
};

const openShell = async (page: Page) => {
  await page.goto(`${origin}/ai-settings`);
  await expect(page.getByRole('heading', { name: 'Integrasi AI', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gemini produksi', exact: true })).toBeVisible();
};

const assertNoHorizontalOverflow = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
};

const assertWithinViewport = async (page: Page, locator: Locator) => {
  await expect(locator).toBeVisible();
  await expect(async () => {
    const bounds = await locator.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(-1);
    expect(bounds!.y).toBeGreaterThanOrEqual(-1);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  }).toPass({ timeout: 8000 });
};

const assertAccessible = async (page: Page) => {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
};

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1280, height: 600 }
]) {
  test(`desktop navigation stays contained and scrolls independently at ${viewport.width}x${viewport.height}`, async ({
    page
  }) => {
    await page.setViewportSize(viewport);
    const unexpected = await mockShell(page);
    await openShell(page);

    const sidebar = page.locator('.sidebar');
    const navigation = page.getByRole('navigation', { name: 'Navigasi utama', exact: true });
    const brand = sidebar.locator('.brand');
    const footer = sidebar.locator('.sidebar-foot');
    await expect(navigation.getByRole('link')).toHaveCount(19);
    await expect(
      navigation.getByRole('link', { name: 'Integrasi AI', exact: true })
    ).toHaveAttribute('aria-current', 'page');
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Buka navigasi', exact: true })).toBeHidden();
    const sidebarBounds = await sidebar.boundingBox();
    expect(sidebarBounds!.width).toBeCloseTo(248, 0);
    expect(sidebarBounds!.height).toBeCloseTo(viewport.height, 0);
    await assertWithinViewport(page, brand);
    await assertWithinViewport(page, footer);
    await assertWithinViewport(page, footer.getByRole('button', { name: 'Keluar', exact: true }));
    const navigationBounds = await navigation.boundingBox();
    const brandBounds = await brand.boundingBox();
    const footerBounds = await footer.boundingBox();
    expect(navigationBounds!.y).toBeGreaterThanOrEqual(brandBounds!.y + brandBounds!.height);
    expect(navigationBounds!.y + navigationBounds!.height).toBeLessThanOrEqual(footerBounds!.y);
    const scroll = await navigation.evaluate((element) => ({
      height: element.clientHeight,
      contentHeight: element.scrollHeight,
      overflow: getComputedStyle(element).overflowY
    }));
    expect(scroll.contentHeight).toBeGreaterThan(scroll.height);
    expect(['auto', 'scroll']).toContain(scroll.overflow);
    await assertNoHorizontalOverflow(page);

    if (viewport.width === 1366) {
      await assertAccessible(page);
    }
    await page.screenshot({
      path:
        viewport.width === 1366
          ? '.runtime/shell-desktop.png'
          : '.runtime/shell-desktop-1280x600.png',
      animations: 'disabled',
      caret: 'hide'
    });

    const pageScrollBefore = await page.evaluate(() => window.scrollY);
    const content = page.locator('main.content');
    const contentScrollBefore = await content.evaluate((element) => element.scrollTop);
    await navigation.hover();
    await page.mouse.wheel(0, 900);
    await expect.poll(() => navigation.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const lastLink = navigation.getByRole('link').last();
    await lastLink.scrollIntoViewIfNeeded();
    const lastBounds = await lastLink.boundingBox();
    expect(lastBounds!.y).toBeGreaterThanOrEqual(navigationBounds!.y - 1);
    expect(lastBounds!.y + lastBounds!.height).toBeLessThanOrEqual(
      navigationBounds!.y + navigationBounds!.height + 1
    );
    expect(await brand.boundingBox()).toEqual(brandBounds);
    expect(await footer.boundingBox()).toEqual(footerBounds);
    expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBefore);
    expect(await content.evaluate((element) => element.scrollTop)).toBe(contentScrollBefore);
    expect(unexpected).toEqual([]);
  });
}

test('the 900px breakpoint switches between desktop navigation and the drawer', async ({
  page
}) => {
  await page.setViewportSize({ width: 901, height: 900 });
  const unexpected = await mockShell(page);
  await openShell(page);
  await expect(page.getByRole('navigation', { name: 'Navigasi utama', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buka navigasi', exact: true })).toBeHidden();

  await page.setViewportSize({ width: 900, height: 900 });
  const opener = page.getByRole('button', { name: 'Buka navigasi', exact: true });
  await expect(opener).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navigasi utama', exact: true })).toHaveCount(
    0
  );
  await opener.click();
  const drawer = page.getByRole('dialog', { name: 'Navigasi aplikasi', exact: true });
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole('navigation', { name: 'Navigasi utama', exact: true }).getByRole('link')
  ).toHaveCount(19);
  await assertWithinViewport(page, drawer);
  await assertNoHorizontalOverflow(page);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
  expect(unexpected).toEqual([]);
});

test('mobile navigation traps focus, shows every menu item, and closes accessibly @a11y', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const unexpected = await mockShell(page);
  await openShell(page);
  const opener = page.getByRole('button', { name: 'Buka navigasi', exact: true });
  const drawer = page.getByRole('dialog', { name: 'Navigasi aplikasi', exact: true });
  await expect(opener).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navigasi utama', exact: true })).toHaveCount(
    0
  );
  await assertNoHorizontalOverflow(page);
  await opener.click();
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute('aria-modal', 'true');
  await assertWithinViewport(page, drawer);
  await page.screenshot({
    path: '.runtime/shell-mobile-drawer.png',
    animations: 'disabled',
    caret: 'hide'
  });
  const close = drawer.getByRole('button', { name: 'Tutup navigasi', exact: true });
  const logout = drawer.getByRole('button', { name: 'Keluar', exact: true });
  const brandLink = drawer.getByRole('link', { name: 'RAHO Control Room, beranda', exact: true });
  const navigation = drawer.getByRole('navigation', { name: 'Navigasi utama', exact: true });
  await expect(close).toBeFocused();
  await expect(navigation.getByRole('link')).toHaveCount(19);
  await expect(navigation.getByRole('link', { name: 'Integrasi AI', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );
  await assertWithinViewport(page, drawer.locator('.brand'));
  await assertWithinViewport(page, drawer.locator('.sidebar-foot'));
  await assertWithinViewport(page, logout);
  await logout.focus();
  await page.keyboard.press('Tab');
  await expect(brandLink).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(logout).toBeFocused();
  await close.focus();
  await navigation.evaluate((element) => {
    element.scrollTop = 0;
  });
  await assertNoHorizontalOverflow(page);
  await assertAccessible(page);
  const navigationBounds = await navigation.boundingBox();
  const lastLink = navigation.getByRole('link').last();
  await lastLink.scrollIntoViewIfNeeded();
  await expect.poll(() => navigation.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const lastBounds = await lastLink.boundingBox();
  expect(lastBounds!.y).toBeGreaterThanOrEqual(navigationBounds!.y - 1);
  expect(lastBounds!.y + lastBounds!.height).toBeLessThanOrEqual(
    navigationBounds!.y + navigationBounds!.height + 1
  );
  await assertWithinViewport(page, logout);

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  await page.getByRole('button', { name: 'Tutup navigasi dari luar', exact: true }).click({
    position: { x: 380, y: 200 }
  });
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  await drawer.getByRole('link', { name: 'Integrasi AI', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  await drawer.getByRole('button', { name: 'Tutup navigasi', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(page).toHaveURL(/\/ai-settings$/u);
  await assertNoHorizontalOverflow(page);
  expect(unexpected).toEqual([]);
});
