import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const origin = process.env['AI_SETTINGS_TEST_ORIGIN']?.trim() || 'http://localhost:3000';
const candidateModel = 'gemini-candidate';
const draftCredential = 'ui-test-placeholder-key';

const savedConnection = {
  id: 'connection-live',
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
  generationConfig: { temperature: 0.2, topP: 0.9 },
  healthState: 'ready',
  lastTestedAt: '2026-11-12T01:00:00.000Z',
  testedRevision: 3,
  revision: 3,
  credentialConfigured: true,
  credentialRotatedAt: '2026-11-12T01:00:00.000Z'
};

type Connection = typeof savedConnection;
type Write = { path: string; body: Record<string, unknown> };

const mockSettings = async (
  page: Page,
  options: {
    connections?: Connection[];
    failModelTest?: boolean;
    failDiscovery?: boolean;
    discoveryGate?: Promise<void>;
  } = {}
) => {
  const writes: Write[] = [];
  let connections = options.connections ?? [{ ...savedConnection }];
  let integration = {
    activeChatConnectionId: connections[0]?.id ?? null,
    activeEmbeddingConnectionId: null,
    generationEnabled: connections.length > 0,
    retrievalEnabled: false,
    status: connections.length > 0 ? 'ready' : 'unconfigured',
    revision: 7
  };
  const unexpected: string[] = [];

  await page.route('**/api/admin/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/admin/v1', '');
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    const respond = (data: unknown) =>
      route.fulfill({ json: { data, meta: { requestId: 'ui-test-request' } } });
    if (request.method() !== 'GET') writes.push({ path, body });

    if (path === '/me') {
      return respond({
        id: 'user-test',
        username: 'ui-test',
        displayName: 'UI Test',
        tenant: { id: 'tenant-test', slug: 'ui-test', name: 'RAHO Test' },
        membership: { id: 'membership-test', role: 'super_admin' },
        permissions: ['ai.settings.manage'],
        csrfToken: 'ui-test-csrf'
      });
    }
    if (path === '/ai/integration') return respond(integration);
    if (path === '/ai/integration/deactivate') {
      integration = {
        ...integration,
        activeChatConnectionId: null,
        generationEnabled: false,
        status: 'inactive',
        revision: integration.revision + 1
      };
      return respond(integration);
    }
    if (path === '/ai/provider-connections' && request.method() === 'GET') {
      return respond(connections);
    }
    if (path === '/ai/provider-connections/discover-models') {
      await options.discoveryGate;
      if (options.failDiscovery) {
        return route.fulfill({
          status: 502,
          json: {
            error: { code: 'MODEL_DISCOVERY_FAILED', message: 'Daftar model belum tersedia.' }
          }
        });
      }
      return respond(['gemini-live', candidateModel, 'gemini-other']);
    }
    if (path === '/ai/provider-connections' && request.method() === 'POST') {
      const created = {
        ...savedConnection,
        id: 'connection-created',
        name: String(body.name),
        modelId: String(body.modelId),
        healthState: 'untested',
        testedRevision: 0,
        revision: 1
      };
      connections = [...connections, created];
      return respond(created);
    }
    if (path.endsWith('/credential/delete')) {
      const connectionId = path.split('/')[3];
      const current = connections.find(({ id }) => id === connectionId) ?? savedConnection;
      const connection = {
        ...current,
        credentialConfigured: false,
        healthState: 'not_tested',
        revision: current.revision + 1,
        testedRevision: 0
      };
      connections = connections.map((item) => (item.id === connectionId ? connection : item));
      integration = {
        ...integration,
        activeChatConnectionId: null,
        generationEnabled: false,
        status: 'inactive',
        revision: integration.revision + 1
      };
      return respond(connection);
    }
    if (path.endsWith('/model-test')) {
      if (options.failModelTest) {
        return route.fulfill({
          status: 422,
          json: { error: { code: 'MODEL_TEST_FAILED', message: 'Model kandidat gagal diuji.' } }
        });
      }
      return respond({
        modelId: body.modelId,
        healthState: 'ready',
        latencyMs: 42,
        actualModel: body.modelId,
        providerRequestId: 'ui-test-provider-request'
      });
    }
    if (path.endsWith('/model-apply')) {
      const connectionId = path.split('/')[3];
      const current = connections.find(({ id }) => id === connectionId) ?? savedConnection;
      const connection = {
        ...current,
        modelId: String(body.modelId),
        revision: current.revision + 1,
        testedRevision: current.revision + 1,
        healthState: 'ready'
      };
      connections = connections.map((item) => (item.id === connectionId ? connection : item));
      integration = {
        ...integration,
        activeChatConnectionId: connection.id,
        generationEnabled: true,
        revision: integration.revision + 1
      };
      return respond({
        connection,
        integration,
        test: { modelId: body.modelId, healthState: 'ready', latencyMs: 42 }
      });
    }
    unexpected.push(`${request.method()} ${path}`);
    return route.fulfill({
      status: 500,
      json: { error: { code: 'UNEXPECTED_TEST_REQUEST', message: 'Unexpected mocked request.' } }
    });
  });

  return { writes, unexpected };
};

const openSettings = async (page: Page) => {
  await page.goto(`${origin}/ai-settings`);
  await expect(page.getByRole('heading', { name: 'Integrasi AI', exact: true })).toBeVisible();
};

const openSavedSettings = async (page: Page) => {
  await openSettings(page);
  await expect(
    page.getByRole('heading', { name: savedConnection.name, exact: true })
  ).toBeVisible();
  await expect(page.getByText('Endpoint resmi provider', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Nama koneksi', { exact: true })).toHaveCount(0);
};

const assertAccessibleLayout = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
};

test('draft key discovers models before saving, testing, and activating a connection', async ({
  page
}) => {
  const mock = await mockSettings(page);
  await openSavedSettings(page);
  await page.getByRole('button', { name: /Koneksi baru/u }).click();
  await expect(
    page.getByRole('heading', { name: 'Tambahkan provider', exact: true })
  ).toBeVisible();
  await page.getByLabel('Nama koneksi', { exact: true }).fill('Gemini baru');
  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('gemini');
  await page.getByRole('textbox', { name: 'API key', exact: true }).fill(draftCredential);
  await page.getByRole('button', { name: 'Ambil daftar model', exact: true }).click();

  const discovery = mock.writes.find(({ path }) => path.endsWith('/discover-models'));
  expect(discovery?.body).toMatchObject({
    provider: 'gemini',
    transport: 'native',
    purpose: 'chat',
    credential: draftCredential
  });
  expect(mock.writes.filter(({ path }) => path === '/ai/provider-connections')).toHaveLength(0);

  await page
    .getByRole('combobox', { name: 'Model chat', exact: true })
    .selectOption(candidateModel);
  await page.getByRole('button', { name: 'Simpan koneksi', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Uji model', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Gunakan model ini', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Uji model', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Gunakan model ini', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Gunakan model ini', exact: true }).click();

  await expect
    .poll(() => mock.writes.filter(({ path }) => path.endsWith('/model-apply')).length)
    .toBe(1);
  expect(mock.writes.find(({ path }) => path.endsWith('/model-test'))?.body).toMatchObject({
    modelId: candidateModel,
    expectedRevision: 1
  });
  expect(mock.writes.find(({ path }) => path.endsWith('/model-apply'))?.body).toMatchObject({
    modelId: candidateModel,
    expectedRevision: 1,
    expectedIntegrationRevision: 7
  });
  expect(mock.writes.map(({ path }) => path)).toEqual([
    '/ai/provider-connections/discover-models',
    '/ai/provider-connections',
    '/ai/provider-connections/connection-created/model-test',
    '/ai/provider-connections/connection-created/model-apply'
  ]);
  expect(mock.unexpected).toEqual([]);
});

test('a failed candidate test keeps the active connection unchanged', async ({ page }) => {
  const mock = await mockSettings(page, { failModelTest: true });
  await openSavedSettings(page);
  await page.getByRole('button', { name: 'Ambil daftar model', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Model chat', exact: true })
    .selectOption(candidateModel);
  await page.getByRole('button', { name: 'Uji model', exact: true }).click();

  await expect(page.getByText('Model kandidat gagal diuji.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gunakan model ini', exact: true })).toBeDisabled();
  await expect(page.locator('.ai-active-card').getByRole('heading')).toHaveText('gemini-live');
  expect(mock.writes.map(({ path }) => path)).toEqual([
    '/ai/provider-connections/discover-models',
    '/ai/provider-connections/connection-live/model-test'
  ]);
  expect(mock.unexpected).toEqual([]);
});

test('changing the model or entering an unsaved key invalidates a successful candidate test', async ({
  page
}) => {
  const mock = await mockSettings(page);
  await openSavedSettings(page);
  await page.getByRole('button', { name: 'Ambil daftar model', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Model chat', exact: true })
    .selectOption(candidateModel);
  await page.getByRole('button', { name: 'Uji model', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Gunakan model ini', exact: true })).toBeEnabled();

  await page
    .getByRole('combobox', { name: 'Model chat', exact: true })
    .selectOption('gemini-other');
  await expect(page.getByRole('button', { name: 'Gunakan model ini', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Uji model', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Gunakan model ini', exact: true })).toBeEnabled();

  await page.getByRole('button', { name: 'Ganti API key', exact: true }).click();
  await page.getByRole('textbox', { name: 'API key', exact: true }).fill(draftCredential);
  await expect(page.getByRole('button', { name: 'Uji model', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Gunakan model ini', exact: true })).toBeDisabled();
  expect(mock.writes.some(({ path }) => path.endsWith('/model-apply'))).toBe(false);
  expect(mock.writes.some(({ path }) => path.endsWith('/credential'))).toBe(false);
  expect(mock.unexpected).toEqual([]);
});

test('discovery failures expose a useful error and allow retrying', async ({ page }) => {
  const mock = await mockSettings(page, { failDiscovery: true });
  await openSavedSettings(page);
  await page.getByRole('button', { name: 'Ambil daftar model', exact: true }).click();
  await expect(page.getByText('Daftar model belum tersedia.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ambil daftar model', exact: true })).toBeEnabled();
  await expect(page.getByRole('combobox', { name: 'Model chat', exact: true })).toHaveValue(
    'gemini-live'
  );
  expect(mock.writes).toHaveLength(1);
  expect(mock.unexpected).toEqual([]);
});

test('model discovery shows progress and disables duplicate actions until it completes', async ({
  page
}) => {
  const gate = Promise.withResolvers<void>();
  const mock = await mockSettings(page, { discoveryGate: gate.promise });
  await openSavedSettings(page);
  await page.getByRole('button', { name: 'Ambil daftar model', exact: true }).click();
  try {
    await expect(
      page.getByRole('button', { name: 'Mengambil model…', exact: true })
    ).toBeDisabled();
    await expect(page.getByRole('combobox', { name: 'Model chat', exact: true })).toBeDisabled();
    await expect(
      page.getByText('Menghubungi provider untuk mengambil daftar model…')
    ).toBeVisible();
    expect(mock.writes).toHaveLength(1);
  } finally {
    gate.resolve();
  }
  await expect(page.getByRole('button', { name: 'Ambil daftar model', exact: true })).toBeEnabled();
  expect(mock.unexpected).toEqual([]);
});

test('deactivating a connection keeps its saved configuration and encrypted key', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const mock = await mockSettings(page);
  await openSavedSettings(page);
  await expect(page.getByText('API key tersimpan', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'API key', exact: true })).toHaveCount(0);
  await assertAccessibleLayout(page);
  await page.screenshot({
    path: '.runtime/ai-settings-desktop.png',
    fullPage: true,
    animations: 'disabled',
    caret: 'hide'
  });
  await page.getByRole('button', { name: 'Nonaktifkan koneksi', exact: true }).click();

  await expect(page.locator('.ai-active-card').getByRole('heading')).toHaveText('Belum diaktifkan');
  await expect(page.getByText('API key tersimpan', { exact: true })).toBeVisible();
  await expect(
    page.locator('.ai-connections-list').getByRole('button', { name: /Gemini produksi/u })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('combobox', { name: 'Model chat', exact: true })).toHaveValue(
    'gemini-live'
  );
  expect(mock.writes).toEqual([
    {
      path: '/ai/integration/deactivate',
      body: {
        purpose: 'chat',
        expectedRevision: 7,
        reason: 'Menonaktifkan koneksi AI melalui pengaturan integrasi'
      }
    }
  ]);
  expect(mock.unexpected).toEqual([]);
});

test('revoking the saved API key clears activation and requires a new key before testing', async ({
  page
}) => {
  const mock = await mockSettings(page);
  await openSavedSettings(page);
  await page.getByText('Pengaturan lanjutan', { exact: true }).click();
  await page.getByRole('button', { name: 'Cabut API key', exact: true }).click();

  await expect(page.getByText('API key belum tersedia', { exact: true })).toBeVisible();
  await expect(page.locator('.ai-active-card').getByRole('heading')).toHaveText('Belum diaktifkan');
  await expect(page.getByRole('button', { name: 'Uji model', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Gunakan model ini', exact: true })).toBeDisabled();
  expect(mock.writes).toEqual([
    {
      path: '/ai/provider-connections/connection-live/credential/delete',
      body: {
        expectedRevision: 3,
        reason: 'Mencabut akses provider melalui pengaturan Integrasi AI'
      }
    }
  ]);
  expect(mock.unexpected).toEqual([]);
});

test('mobile model selection supports the keyboard without horizontal overflow @a11y', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = await mockSettings(page);
  await openSavedSettings(page);
  await expect(page.getByRole('combobox', { name: 'Koneksi tersimpan', exact: true })).toHaveValue(
    savedConnection.id
  );
  const discover = page.getByRole('button', { name: 'Ambil daftar model', exact: true });
  await discover.focus();
  await page.keyboard.press('Enter');
  const model = page.getByRole('combobox', { name: 'Model chat', exact: true });
  await expect(model.getByRole('option', { name: candidateModel, exact: true })).toHaveCount(1);
  const options = await model
    .locator('option')
    .evaluateAll((items) => items.map((item) => (item as HTMLOptionElement).value));
  await model.focus();
  await page.keyboard.press('End');
  await expect(model).toHaveValue(options.at(-1)!);
  await page.keyboard.press('ArrowUp');
  await expect(model).toHaveValue(options.at(-2)!);
  await assertAccessibleLayout(page);
  await expect(page.getByText('API key tersimpan', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'API key', exact: true })).toHaveCount(0);
  await page.screenshot({
    path: '.runtime/ai-settings-mobile.png',
    fullPage: true,
    animations: 'disabled',
    caret: 'hide'
  });
  expect(mock.unexpected).toEqual([]);
});
