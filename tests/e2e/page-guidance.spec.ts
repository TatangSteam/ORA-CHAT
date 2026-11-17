import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ baseURL: process.env.GUIDANCE_TEST_ORIGIN ?? 'http://localhost:3000' });

test.beforeEach(async ({ page }) => {
  await page.route('**/api/admin/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/admin/v1', '');
    let data: unknown = [];
    if (path === '/me')
      data = {
        id: 'guide-user',
        displayName: 'Admin',
        tenant: { id: 'test', name: 'RAHO Test', slug: 'default' },
        membership: { id: 'test', role: 'super_admin' },
        permissions: ['overview.read', 'knowledge.read', 'ai.analytics.read', 'session.read'],
        csrfToken: 'guide-test'
      };
    if (path === '/session') data = { state: 'connected' };
    await route.fulfill({ json: { data, meta: { requestId: 'guide-test' } } });
  });
});

test('knowledge explains the form and publication stages next to the controls', async ({
  page
}) => {
  await page.goto('/knowledge');
  const editor = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Tambah knowledge', exact: true }) });
  await expect(editor.getByLabel('Penjelasan bagian')).toContainText(
    'Draft belum menjadi sumber aktif'
  );
  await expect(
    page.getByRole('textbox', { name: 'Judul', exact: true })
  ).toHaveAccessibleDescription(/Nama topik yang jelas/);
  await expect(
    page.getByRole('textbox', { name: 'Jawaban terverifikasi', exact: true })
  ).toHaveAccessibleDescription(/Jangan menebak/);
  await expect(
    page.getByRole('textbox', { name: 'Varian pertanyaan (satu per baris)', exact: true })
  ).toHaveAccessibleDescription(/satu per baris/);
  await expect(
    page.getByText('Diarsipkan dan tidak digunakan sebagai sumber aktif.', { exact: true })
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/section-help-knowledge.png', fullPage: true });
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('compose explains real sending and scheduling on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/compose');
  await expect(
    page.getByRole('textbox', { name: 'Nomor tujuan', exact: true })
  ).toHaveAccessibleDescription(/Periksa agar tidak salah kirim/);
  await expect(page.getByLabel('Jadwal pengiriman', { exact: true })).toHaveAccessibleDescription(
    /Kosongkan agar antrean segera memproses pesan/
  );
  await expect(
    page.getByText('Mengantrekan pengiriman sungguhan. Pantau hasil di halaman Riwayat.', {
      exact: true
    })
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page
    .locator('.compose-card')
    .screenshot({ path: 'test-results/section-help-compose-mobile.png' });
});

test('saves a handoff scenario without requiring knowledge citations', async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route('**/api/admin/v1/ai/test-cases', async (route) => {
    if (route.request().method() === 'POST') submitted = route.request().postDataJSON();
    await route.fulfill({ json: { data: [], meta: { requestId: 'guide-test' } } });
  });
  await page.goto('/ai-readiness');
  await expect(
    page.getByRole('heading', { name: 'Petunjuk penggunaan', exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('Pengujian tidak mengirim WhatsApp.', { exact: false })
  ).toBeVisible();
  await page.getByLabel('Nama', { exact: true }).fill('Permintaan bantuan manusia');
  await page
    .getByRole('textbox', { name: 'Pertanyaan', exact: true })
    .fill('Saya ingin berbicara dengan admin');
  await page.getByLabel('Hasil yang diharapkan').selectOption('handoff');
  await expect(page.getByLabel('Wajib menyertakan sumber')).toBeDisabled();
  await page
    .getByLabel('Kata atau frasa yang tidak boleh muncul (opsional)')
    .fill('pasti sembuh\ndiagnosis');
  await page.getByRole('button', { name: 'Simpan kasus uji' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Kasus uji disimpan.' })).toBeVisible();
  expect(submitted?.expectedBehavior).toEqual({
    status: 'handoff',
    requireCitation: false,
    forbiddenTerms: ['pasti sembuh', 'diagnosis'],
    maxLatencyMs: 30000
  });
  await page.locator('#main-content').evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: 'test-results/guidance-desktop.png', fullPage: true });
});

test('shows source evidence on mobile and clears an old answer after a failed test', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let attempts = 0;
  await page.route('**/api/admin/v1/ai/playground', async (route) => {
    attempts += 1;
    if (attempts > 1) {
      await route.fulfill({
        status: 503,
        json: { error: { code: 'UNAVAILABLE', message: 'Provider tidak tersedia' } }
      });
      return;
    }
    await route.fulfill({
      json: {
        data: {
          id: 'answer-test',
          status: 'answered',
          answer: 'Contoh jawaban untuk pemeriksaan.',
          shouldHandoff: false,
          fallbackReason: null,
          latencyMs: 100,
          sources: [
            {
              id: 'source-test',
              label: 'K1',
              preview: 'Cuplikan sumber untuk diperiksa admin.',
              score: 0.9
            }
          ]
        },
        meta: { requestId: 'guide-test' }
      }
    });
  });
  await page.goto('/ai-search');
  await expect(page.getByLabel('Petunjuk penggunaan')).toBeVisible();
  await page.getByLabel('Pertanyaan', { exact: true }).fill('Pertanyaan pengujian');
  await page.getByRole('button', { name: 'Uji jawaban', exact: true }).click();
  await page.getByText('Periksa sumber pendukung', { exact: true }).click();
  await expect(page.getByText('Cuplikan sumber untuk diperiksa admin.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.screenshot({ path: 'test-results/guidance-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Uji jawaban', exact: true }).click();
  await expect(page.getByText('Contoh jawaban untuk pemeriksaan.')).toHaveCount(0);
  await expect(page.getByRole('status')).toBeVisible();
});
