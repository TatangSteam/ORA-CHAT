import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const password = readFileSync(resolve('.secrets/bootstrap_admin_password'), 'utf8').trim();

const login = async (page: Page) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill('superadmin');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/u);
};

const assertAccessible = async (page: Page) => {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
};

const shellRoutes = [
  'overview',
  'inbox',
  'contacts',
  'compose',
  'outbox',
  'handoffs',
  'chatbot',
  'ai-settings',
  'session',
  'safety'
] as const;

const phase4Routes = ['knowledge', 'documents', 'ai-search'] as const;
const phase5Routes = ['ai-operations', 'ai-analytics', 'ai-readiness'] as const;
const phase6Routes = ['templates', 'compose'] as const;

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1200 },
  { name: 'mobile', width: 390, height: 844 }
] as const) {
  test.describe(viewport.name, () => {
    test.use({ viewport });

    test(`@visual login ${viewport.name}`, async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: 'Masuk ke control panel' })).toBeVisible();
      await expect(page).toHaveScreenshot(`${viewport.name}-login.png`);
    });

    test(`@visual operational shell ${viewport.name}`, async ({ page }) => {
      await login(page);
      for (const route of shellRoutes) {
        await page.goto(`/${route}`);
        await expect(page.locator('main')).toBeVisible();
        if (route === 'ai-settings') {
          await expect(page.getByRole('heading', { name: 'Tambahkan provider' })).toBeVisible();
        }
        const snapshot = route === 'ai-settings' ? 'v2-ai-settings' : route;
        await expect(page).toHaveScreenshot(`${viewport.name}-${snapshot}.png`, {
          mask: [
            page.locator('.count-badge'),
            page.locator('.data-list'),
            page.locator('.timeline')
          ]
        });
      }
    });

    test(`@a11y login and operational shell ${viewport.name}`, async ({ page }) => {
      await page.goto('/login');
      await assertAccessible(page);

      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Username')).toBeFocused();

      await login(page);
      for (const route of shellRoutes) {
        await page.goto(`/${route}`);
        await assertAccessible(page);
      }
    });

    test(`@visual @phase4 knowledge surfaces ${viewport.name}`, async ({ page }) => {
      await login(page);
      for (const route of phase4Routes) {
        await page.goto(`/${route}`);
        await expect(page.locator('main')).toBeVisible();
        await expect(page).toHaveScreenshot(`${viewport.name}-phase4-${route}.png`, {
          mask: [page.locator('.stack-list')]
        });
      }
    });

    test(`@a11y @phase4 knowledge surfaces ${viewport.name}`, async ({ page }) => {
      await login(page);
      for (const route of phase4Routes) {
        await page.goto(`/${route}`);
        await assertAccessible(page);
      }
    });

    test(`@visual @phase5 operations surfaces ${viewport.name}`, async ({ page }) => {
      await login(page);
      for (const route of phase5Routes) {
        await page.goto(`/${route}`);
        await expect(page.locator('main')).toBeVisible();
        await expect(page).toHaveScreenshot(`${viewport.name}-phase5-${route}.png`, {
          mask: [page.locator('.stack-list'), page.locator('.metric-grid')]
        });
      }
    });

    test(`@a11y @phase5 operations surfaces ${viewport.name}`, async ({ page }) => {
      await login(page);
      for (const route of phase5Routes) {
        await page.goto(`/${route}`);
        await assertAccessible(page);
      }
    });

    test(`@visual @phase6 template surfaces ${viewport.name}`, async ({ page }) => {
      await login(page);
      for (const route of phase6Routes) {
        await page.goto(`/${route}`);
        await expect(page.locator('main')).toBeVisible();
        await expect(page).toHaveScreenshot(`${viewport.name}-phase6-${route}.png`, {
          mask: [page.locator('.phase6-template-list')]
        });
      }
    });

    test(`@a11y @phase6 template surfaces ${viewport.name}`, async ({ page }) => {
      await login(page);
      for (const route of phase6Routes) {
        await page.goto(`/${route}`);
        await assertAccessible(page);
      }
    });
  });
}
