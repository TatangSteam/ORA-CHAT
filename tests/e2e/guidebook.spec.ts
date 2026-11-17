import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.use({ baseURL: process.env['GUIDEBOOK_TEST_ORIGIN'] ?? 'http://localhost:3000' });

test.beforeEach(async ({ page }) => {
  await page.route('**/api/admin/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/admin/v1', '');
    const data =
      path === '/me'
        ? {
            id: 'guidebook-user',
            username: 'reader',
            displayName: 'Pembaca Panduan',
            tenant: { id: 'test', slug: 'default', name: 'RAHO Test' },
            membership: { id: 'test', role: 'operator' },
            permissions: ['knowledge.read', 'messages.read'],
            csrfToken: 'guidebook-test'
          }
        : [];
    await route.fulfill({ json: { data, meta: { requestId: 'guidebook-test' } } });
  });
});

test('one guidebook covers every feature and respects action permissions', async ({ page }) => {
  await page.goto('/guidebook');
  await expect(page.getByRole('heading', { name: 'Buku Panduan', exact: true })).toBeVisible();
  await expect(page.locator('section[id^="fitur-"]')).toHaveCount(19);
  await expect(
    page.getByRole('heading', { name: 'Persiapan pertama kali', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Arti istilah dan status', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mengatasi kendala', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Buka Knowledge', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Buka Integrasi AI', exact: true })).toHaveCount(0);
  const toc = page.getByRole('navigation', { name: 'Daftar isi buku panduan', exact: true });
  await toc.getByRole('link', { name: 'Integrasi AI', exact: true }).click();
  await expect(page).toHaveURL(/#fitur-ai-settings$/u);
  await expect(page.locator('#judul-ai-settings')).toBeInViewport();
  await page.locator('#main-content').evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: 'test-results/guidebook-desktop.png', fullPage: false });
});

test('search finds explanations and can recover from an empty result', async ({ page }) => {
  await page.goto('/guidebook');
  const search = page.getByRole('searchbox', {
    name: 'Cari fitur, istilah, atau kendala',
    exact: true
  });
  await search.fill('API key');
  await expect(page.locator('#fitur-ai-settings')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Ditemukan');
  await search.fill('zzztidakadafiturzzz');
  await expect(
    page.getByRole('heading', { name: 'Penjelasan belum ditemukan', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tampilkan seluruh panduan', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(page.locator('section[id^="fitur-"]')).toHaveCount(19);
});

test('guidebook stays available without feature permissions and works on mobile @a11y', async ({
  page
}) => {
  await page.route('**/api/admin/v1/me', async (route) => {
    await route.fulfill({
      json: {
        data: {
          id: 'reader',
          username: 'reader',
          displayName: 'Pembaca',
          tenant: { id: 'test', slug: 'default', name: 'RAHO Test' },
          membership: { id: 'reader', role: 'viewer' },
          permissions: [],
          csrfToken: 'guidebook-test'
        },
        meta: { requestId: 'guidebook-test' }
      }
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/guidebook');
  await page.getByRole('button', { name: 'Buka navigasi', exact: true }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Navigasi utama', exact: true })
      .getByRole('link', { name: 'Buku Panduan', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tutup navigasi', exact: true }).click();
  await expect(page.locator('section[id^="fitur-"]')).toHaveCount(19);
  await expect(page.getByRole('link', { name: /^Buka /u })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(result.violations).toEqual([]);
  await page.screenshot({ path: 'test-results/guidebook-mobile.png', fullPage: false });
});
