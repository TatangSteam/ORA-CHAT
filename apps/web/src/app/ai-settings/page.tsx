'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Shell } from '../../components/shell';
import { SectionHelp, FieldHelp } from '../../components/section-help';
import { api, ApiError } from '../../lib/api';

type Purpose = 'chat' | 'embedding';
type Provider =
  'mock' | 'openai' | 'anthropic' | 'gemini' | 'openai-compatible' | 'openclaw-gateway';
interface Integration {
  activeChatConnectionId: string | null;
  activeEmbeddingConnectionId: string | null;
  generationEnabled: boolean;
  retrievalEnabled: boolean;
  status: string;
  revision: number;
}
interface Connection {
  id: string;
  name: string;
  purpose: Purpose;
  provider: Provider;
  transport: 'native' | 'compatible' | 'gateway';
  baseUrl: string | null;
  modelId: string;
  dimensions: number | null;
  taskType: string | null;
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens: number;
  generationConfig: { temperature?: number; topP?: number };
  healthState: string;
  lastTestedAt: string | null;
  testedRevision: number | null;
  revision: number;
  credentialConfigured: boolean;
  credentialRotatedAt: string | null;
}
interface Probe {
  modelId: string;
  healthState: string;
  latencyMs: number;
  actualModel: string;
}
const providers: { value: Provider; label: string }[] = [
  { value: 'openai-compatible', label: 'OpenAI-compatible' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openclaw-gateway', label: 'OpenClaw gateway' },
  { value: 'mock', label: 'Mock (pengujian lokal)' }
];
const transportFor = (p: Provider) =>
  p === 'openai-compatible' ? 'compatible' : p === 'openclaw-gateway' ? 'gateway' : 'native';
const friendlyError = (error: unknown) => {
  if (!(error instanceof ApiError))
    return 'Permintaan belum berhasil. Periksa koneksi lalu coba lagi.';
  const messages: Record<string, string> = {
    AI_PROVIDER_UNAUTHORIZED: 'API key ditolak. Periksa key atau gunakan key baru.',
    AI_PROVIDER_FORBIDDEN: 'Key ini tidak memiliki izin untuk mengakses layanan tersebut.',
    AI_PROVIDER_RATE_LIMITED: 'Batas permintaan tercapai. Tunggu sebentar lalu coba lagi.',
    AI_PROVIDER_QUOTA_EXCEEDED: 'Kuota provider habis. Periksa saldo atau batas penggunaan akun.',
    AI_PROVIDER_MODEL_NOT_FOUND:
      'Model ini tidak tersedia untuk koneksi Anda. Perbarui daftar model.',
    AI_PROVIDER_INCOMPATIBLE: 'Respons model belum sesuai format yang dibutuhkan chatbot.',
    AI_PROVIDER_TIMEOUT:
      'Provider belum merespons dalam batas waktu. Coba lagi atau tambah timeout.',
    AI_PROVIDER_BLOCKED_URL: 'Endpoint tidak diizinkan. Gunakan URL HTTPS provider yang valid.',
    AI_PROVIDER_UNAVAILABLE: 'Provider sedang tidak tersedia. Coba lagi beberapa saat lagi.',
    REVISION_CONFLICT: 'Konfigurasi berubah di sesi lain. Muat ulang halaman sebelum melanjutkan.'
  };
  return messages[error.code] ?? error.message;
};
const dateLabel = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Belum diuji';
const Icon = ({ kind = 'spark' }: { kind?: 'spark' | 'key' | 'check' | 'arrow' }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {kind === 'key' ? (
      <>
        <circle cx="8" cy="8" r="4" />
        <path d="m11 11 9 9m-3-3 3-3m-6 0 3-3" />
      </>
    ) : kind === 'check' ? (
      <path d="m5 12 4 4L19 6" />
    ) : kind === 'arrow' ? (
      <path d="M5 12h14m-5-5 5 5-5 5" />
    ) : (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
        <path d="m20 3 .5 1.5L22 5l-1.5.5L20 7l-.5-1.5L18 5l1.5-.5L20 3Z" />
      </>
    )}
  </svg>
);

function ConnectionEditor({
  connection,
  purpose,
  integration,
  onSaved,
  onRefresh
}: {
  connection: Connection | null;
  purpose: Purpose;
  integration: Integration | null;
  onSaved: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const id = useId();
  const [name, setName] = useState(
    connection?.name ?? (purpose === 'chat' ? 'Yoga AI' : 'Embedding knowledge')
  );
  const [provider, setProvider] = useState<Provider>(connection?.provider ?? 'openai-compatible');
  const [baseUrl, setBaseUrl] = useState(connection?.baseUrl ?? 'https://ai.yogathedev.com/v1');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [editKey, setEditKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [manual, setManual] = useState(false);
  const [modelId, setModelId] = useState(connection?.modelId ?? '');
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [timeoutMs, setTimeoutMs] = useState(connection?.timeoutMs ?? 30000);
  const [maxOutputTokens, setMaxOutputTokens] = useState(connection?.maxOutputTokens ?? 512);
  const [dimensions, setDimensions] = useState(connection?.dimensions ?? 1536);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const isNew = !connection;
  const hasEndpoint = ['openai-compatible', 'openclaw-gateway'].includes(provider);
  const canDiscover = connection ? !editKey : provider === 'mock' || secret.trim().length >= 8;
  const activeId =
    purpose === 'chat'
      ? integration?.activeChatConnectionId
      : integration?.activeEmbeddingConnectionId;
  const active = Boolean(connection && activeId === connection.id);
  const embeddingReady =
    purpose === 'embedding' &&
    connection?.healthState === 'ready' &&
    connection.testedRevision === connection.revision &&
    modelId === connection.modelId;
  const reason = 'Konfigurasi AI diperbarui melalui halaman Integrasi AI';
  const modelOptions = [...new Set([...(modelId ? [modelId] : []), ...models])].sort((a, b) =>
    a.localeCompare(b)
  );
  const visibleModels = modelOptions.filter(
    (m) => m.toLowerCase().includes(search.toLowerCase()) || m === modelId
  );
  const updateModel = (value: string) => {
    setModelId(value);
    setProbe(null);
    setNotice(null);
  };
  const resetDraft = () => {
    setModels([]);
    setLoadedAt(null);
    setModelId('');
    setProbe(null);
    setNotice(null);
  };
  const run = async (label: string, task: () => Promise<void>) => {
    if (busy) return;
    setBusy(label);
    setNotice(null);
    try {
      await task();
    } catch (error) {
      setNotice({ text: friendlyError(error), error: true });
      setProbe(null);
    } finally {
      setBusy(null);
    }
  };
  const discover = () =>
    run('models', async () => {
      const { data } = await api<string[]>('/ai/provider-connections/discover-models', {
        method: 'POST',
        body: JSON.stringify(
          connection
            ? { connectionId: connection.id }
            : {
                provider,
                transport: transportFor(provider),
                purpose,
                baseUrl: hasEndpoint ? baseUrl.trim().replace(/\/+$/u, '') : null,
                credential: secret.trim() || undefined,
                timeoutMs
              }
        )
      });
      const unique = [...new Set(data)].sort((a, b) => a.localeCompare(b));
      setModels(unique);
      setLoadedAt(new Date().toISOString());
      setSearch('');
      if (!modelId && unique.length === 1) setModelId(unique[0]!);
      setNotice({
        text: unique.length
          ? `${unique.length} model tersedia. Pilih model yang ingin digunakan.`
          : 'Provider belum mengembalikan model. Anda dapat memasukkan ID model secara manual.',
        error: false
      });
      if (!unique.length) setManual(true);
    });
  const configuration = () => ({
    name: name.trim(),
    purpose,
    provider,
    transport: transportFor(provider),
    baseUrl: hasEndpoint ? baseUrl.trim().replace(/\/+$/u, '') : null,
    modelId: modelId.trim(),
    dimensions: purpose === 'embedding' ? dimensions : null,
    taskType: purpose === 'embedding' ? 'RETRIEVAL_QUERY' : null,
    timeoutMs,
    maxRetries: 0,
    maxOutputTokens,
    generationConfig: connection?.generationConfig ?? {},
    reason
  });
  const save = () =>
    run('save', async () => {
      const { data } = await api<Connection>('/ai/provider-connections', {
        method: 'POST',
        body: JSON.stringify({
          ...configuration(),
          ...(secret.trim() ? { credential: secret.trim() } : {})
        })
      });
      setSecret('');
      await onSaved(data.id);
    });
  const test = () =>
    run('test', async () => {
      if (!connection) return;
      if (purpose === 'chat') {
        const { data } = await api<Probe>(`/ai/provider-connections/${connection.id}/model-test`, {
          method: 'POST',
          body: JSON.stringify({ modelId, expectedRevision: connection.revision, reason })
        });
        setProbe(data);
        setNotice({ text: 'Model lolos uji respons chatbot. Siap digunakan.', error: false });
      } else {
        if (modelId !== connection.modelId)
          throw new Error('Simpan model embedding terlebih dahulu.');
        const { data } = await api<{ connection: Connection; test: Probe }>(
          `/ai/provider-connections/${connection.id}/test`,
          {
            method: 'POST',
            body: JSON.stringify({ expectedRevision: connection.revision, reason })
          }
        );
        if (data.connection.healthState !== 'ready') {
          setNotice({
            text: `Uji embedding belum berhasil: ${data.connection.healthState.replaceAll('_', ' ')}.`,
            error: true
          });
          return;
        }
        setProbe({ ...data.test, modelId });
        await onRefresh();
      }
    });
  const apply = () =>
    run('apply', async () => {
      if (!connection || !integration) return;
      if (purpose === 'chat')
        await api(`/ai/provider-connections/${connection.id}/model-apply`, {
          method: 'POST',
          body: JSON.stringify({
            modelId,
            expectedRevision: connection.revision,
            expectedIntegrationRevision: integration.revision,
            reason
          })
        });
      else
        await api('/ai/integration/activate', {
          method: 'POST',
          body: JSON.stringify({
            purpose,
            connectionId: connection.id,
            expectedRevision: integration.revision,
            reason
          })
        });
      await onRefresh();
      setProbe(null);
      setNotice({
        text: `${purpose === 'chat' ? 'Model chat' : 'Koneksi embedding'} berhasil diaktifkan.`,
        error: false
      });
    });

  return (
    <section className="ai-editor section-card" aria-label="Pengaturan koneksi AI">
      <div className="ai-editor-heading">
        <div>
          <p className="eyebrow">{isNew ? 'KONEKSI BARU' : 'PENGATURAN KONEKSI'}</p>
          <h2>{isNew ? 'Tambahkan provider' : connection.name}</h2>
        </div>
        <span className="ai-purpose-label">{purpose === 'chat' ? 'Chat' : 'Embedding'}</span>
      </div>
      <fieldset className="ai-fields" disabled={Boolean(busy)}>
        <div className="ai-step-heading">
          <div>
            <h3>Koneksi API</h3>
            <SectionHelp topic="ai-connection" />
            {isNew && <p>Isi endpoint dan API key dari provider Anda.</p>}
          </div>
        </div>
        {isNew ? (
          <>
            <div className="ai-form-two">
              <label htmlFor={`${id}-name`}>
                Nama koneksi
                <input
                  aria-label="Nama koneksi"
                  aria-describedby="help-ai-settings-1"
                  id={`${id}-name`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={160}
                  readOnly={!isNew}
                  placeholder="Contoh: Yoga AI"
                />
                <FieldHelp id="help-ai-settings-1">
                  Nama internal untuk membedakan akun atau provider, misalnya Provider utama CS.
                </FieldHelp>
              </label>
              <label htmlFor={`${id}-provider`}>
                Provider
                <select
                  aria-label="Provider"
                  aria-describedby="help-ai-settings-2"
                  id={`${id}-provider`}
                  value={provider}
                  disabled={!isNew}
                  onChange={(e) => {
                    setProvider(e.target.value as Provider);
                    resetDraft();
                  }}
                >
                  {providers
                    .filter((p) => purpose !== 'embedding' || p.value !== 'anthropic')
                    .map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                </select>
                <FieldHelp id="help-ai-settings-2">
                  Pilih penyedia yang menerbitkan API key. Pilihan ini menentukan cara menghubungi
                  layanan AI.
                </FieldHelp>
              </label>
            </div>
            {hasEndpoint && (
              <div className="ai-endpoint-field">
                <label htmlFor={`${id}-url`}>Base URL</label>
                <input
                  id={`${id}-url`}
                  aria-describedby={`${id}-url-help`}
                  type="url"
                  value={baseUrl}
                  readOnly={!isNew}
                  onChange={(e) => {
                    setBaseUrl(e.target.value);
                    resetDraft();
                  }}
                  placeholder="https://provider.example/v1"
                  spellCheck={false}
                />
                <small id={`${id}-url-help`}>
                  Alamat API dari penyedia layanan, misalnya https://provider.example/v1. Gunakan
                  endpoint yang berakhir dengan /v1, bukan alamat halaman login provider.
                </small>
              </div>
            )}
          </>
        ) : (
          <dl className="ai-connection-details">
            <div>
              <dt>Provider</dt>
              <dd>{providers.find((p) => p.value === provider)?.label}</dd>
            </div>
            <div>
              <dt>Endpoint</dt>
              <dd className="ai-endpoint-value">
                {connection.baseUrl || 'Endpoint resmi provider'}
              </dd>
            </div>
          </dl>
        )}
        {provider !== 'mock' && (
          <div className="ai-key-area">
            {isNew || editKey ? (
              <>
                <div className="ai-secret-field">
                  <label htmlFor={`${id}-key`}>API key</label>
                  <div className="ai-secret-input">
                    <input
                      id={`${id}-key`}
                      aria-describedby={`${id}-key-help`}
                      type={showSecret ? 'text' : 'password'}
                      value={secret}
                      onChange={(e) => {
                        setSecret(e.target.value);
                        setProbe(null);
                        if (isNew) {
                          setModels([]);
                          setLoadedAt(null);
                        }
                      }}
                      autoComplete="new-password"
                      placeholder="Masukkan API key"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      className="ai-text-button"
                      aria-label={showSecret ? 'Sembunyikan API key' : 'Tampilkan API key'}
                      aria-pressed={showSecret}
                      onClick={() => setShowSecret(!showSecret)}
                    >
                      {showSecret ? 'Sembunyikan' : 'Tampilkan'}
                    </button>
                  </div>
                </div>
                <small id={`${id}-key-help`}>
                  Kunci akses dari akun provider untuk mengizinkan aplikasi memakai AI. Salin dari
                  dashboard provider; jangan membagikannya kepada pelanggan. Key dikirim melalui
                  server dan disimpan terenkripsi.
                </small>
                {editKey && (
                  <>
                    <p className="ai-inline-hint">
                      Key baru perlu disimpan dan diuji ulang sebelum koneksi digunakan.
                    </p>
                    <div className="action-row">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={secret.trim().length < 8}
                        onClick={() =>
                          void run('key', async () => {
                            await api(`/ai/provider-connections/${connection!.id}/credential`, {
                              method: 'POST',
                              body: JSON.stringify({
                                credential: secret.trim(),
                                expectedRevision: connection!.revision,
                                reason
                              })
                            });
                            setSecret('');
                            setEditKey(false);
                            setProbe(null);
                            await onRefresh();
                            setNotice({
                              text: 'API key diperbarui. Uji kembali sebelum mengaktifkan koneksi.',
                              error: false
                            });
                          })
                        }
                      >
                        Simpan API key baru
                      </button>
                      <button
                        type="button"
                        className="ai-text-button"
                        onClick={() => {
                          setSecret('');
                          setEditKey(false);
                        }}
                      >
                        Batal
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="ai-key-saved">
                <span className="ai-key-icon">
                  <Icon kind="key" />
                </span>
                <div>
                  <strong>
                    {connection.credentialConfigured
                      ? 'API key tersimpan'
                      : 'API key belum tersedia'}
                  </strong>
                  <small>
                    {connection.credentialConfigured
                      ? `Terenkripsi${connection.credentialRotatedAt ? ` · diperbarui ${dateLabel(connection.credentialRotatedAt)}` : ''}`
                      : 'Tambahkan key untuk menghubungkan provider.'}
                  </small>
                </div>
                <button
                  type="button"
                  className="ai-text-button"
                  onClick={() => {
                    setEditKey(true);
                    setProbe(null);
                  }}
                >
                  Ganti API key
                </button>
              </div>
            )}
          </div>
        )}
        <div className="ai-step-divider" />
        <div className="ai-step-heading">
          <div>
            <h3>Model & konfigurasi</h3>
            <SectionHelp topic="ai-model" />
            <p>
              Pilih model yang akan digunakan untuk{' '}
              {purpose === 'chat' ? 'balasan AI' : 'pencarian knowledge'}.
            </p>
          </div>
        </div>
        <div className="ai-model-toolbar">
          <div>
            <strong>{loadedAt ? `${models.length} model tersedia` : 'Katalog model'}</strong>
            <small>
              {loadedAt
                ? `Diperbarui ${dateLabel(loadedAt)}`
                : 'Muat model yang tersedia pada provider.'}
            </small>
          </div>
          <button
            type="button"
            className="secondary-button"
            disabled={!canDiscover || (isNew && hasEndpoint && !baseUrl.trim())}
            onClick={() => void discover()}
          >
            {busy === 'models' ? 'Mengambil model…' : 'Ambil daftar model'}
          </button>
        </div>
        {models.length > 0 && !manual && (
          <label htmlFor={`${id}-search`} className="ai-search-label">
            Cari model
            <input
              aria-label="Cari model"
              aria-describedby="help-ai-settings-3"
              id={`${id}-search`}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari berdasarkan ID model…"
            />
            <FieldHelp id="help-ai-settings-3">
              Ketik sebagian ID untuk menyaring daftar. Pencarian tidak mengubah model aktif.
            </FieldHelp>
          </label>
        )}
        <label htmlFor={`${id}-model`}>
          {purpose === 'chat' ? 'Model chat' : 'Model embedding'}
          {manual ? (
            <input
              id={`${id}-model`}
              aria-describedby={`${id}-model-help`}
              value={modelId}
              onChange={(e) => updateModel(e.target.value)}
              placeholder="Masukkan ID model dari provider"
              spellCheck={false}
            />
          ) : (
            <select
              id={`${id}-model`}
              aria-describedby={`${id}-model-help`}
              value={modelId}
              onChange={(e) => updateModel(e.target.value)}
            >
              <option value="">Pilih model dari API</option>
              {visibleModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          )}
        </label>
        <FieldHelp id={`${id}-model-help`}>
          Model adalah mesin AI yang dipakai koneksi ini. Pilih dari daftar, atau masukkan ID persis
          dari provider. Pilihan baru baru berlaku setelah diuji dan diaktifkan.
        </FieldHelp>
        <label className="ai-checkbox">
          <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
          <span>Masukkan ID model secara manual</span>
        </label>
        {purpose === 'embedding' && (
          <label htmlFor={`${id}-dimensions`}>
            Dimensi embedding
            <input
              aria-label="Dimensi embedding"
              aria-describedby="help-ai-settings-4"
              id={`${id}-dimensions`}
              type="number"
              min={1}
              max={16384}
              value={dimensions}
              disabled={!isNew}
              onChange={(e) => setDimensions(Number(e.target.value))}
            />
            <FieldHelp id="help-ai-settings-4">
              Salin jumlah dimensi dari spesifikasi model. Harus cocok dengan keluaran model dan
              indeks dokumen.
            </FieldHelp>
          </label>
        )}
        <details className="ai-advanced">
          <summary>Pengaturan lanjutan</summary>
          <SectionHelp topic="ai-advanced" />
          <div className="ai-form-two">
            <label htmlFor={`${id}-timeout`}>
              Timeout (detik)
              <input
                aria-label="Timeout (detik)"
                aria-describedby="help-ai-settings-5"
                id={`${id}-timeout`}
                type="number"
                min={1}
                max={60}
                value={timeoutMs / 1000}
                disabled={!isNew}
                onChange={(e) => {
                  setTimeoutMs(Number(e.target.value) * 1000);
                  setProbe(null);
                }}
              />
              <FieldHelp id="help-ai-settings-5">
                Lama maksimal menunggu provider. Jika terlewati, permintaan gagal. Biarkan nilai
                awal jika belum perlu diubah.
              </FieldHelp>
            </label>
            <label htmlFor={`${id}-output`}>
              Batas token output
              <input
                aria-label="Batas token output"
                aria-describedby="help-ai-settings-6"
                id={`${id}-output`}
                type="number"
                min={16}
                max={32768}
                value={maxOutputTokens}
                disabled={!isNew}
                onChange={(e) => {
                  setMaxOutputTokens(Number(e.target.value));
                  setProbe(null);
                }}
              />
              <FieldHelp id="help-ai-settings-6">
                Batas panjang jawaban dalam token, yaitu potongan teks. Ini bukan saldo akun
                provider.
              </FieldHelp>
            </label>
          </div>
          <p>
            Parameter tersimpan mengikuti koneksi. Gunakan koneksi baru untuk endpoint atau
            pengaturan yang berbeda.
          </p>
          {connection && provider !== 'mock' && connection.credentialConfigured && (
            <div className="ai-revoke-key">
              <p>
                Mencabut API key akan menonaktifkan koneksi ini sampai key baru disimpan dan diuji.
              </p>
              <button
                type="button"
                className="ai-text-button ai-danger-link"
                onClick={() =>
                  void run('revoke', async () => {
                    await api(`/ai/provider-connections/${connection.id}/credential/delete`, {
                      method: 'POST',
                      body: JSON.stringify({
                        expectedRevision: connection.revision,
                        reason: 'Mencabut akses provider melalui pengaturan Integrasi AI'
                      })
                    });
                    setProbe(null);
                    setSecret('');
                    await onRefresh();
                  })
                }
              >
                Cabut API key
              </button>
            </div>
          )}
        </details>
        <div className="ai-step-divider" />
        <div className="ai-step-heading">
          <div>
            <h3>Validasi & aktivasi</h3>
            <SectionHelp topic="ai-activation" />
            <p>
              {isNew
                ? 'Simpan koneksi, lalu uji model sebelum mengaktifkannya.'
                : 'Model aktif tetap digunakan selama kandidat model diuji.'}
            </p>
          </div>
        </div>
        {probe && (
          <div className="ai-test-result" role="status">
            <Icon kind="check" />
            <div>
              <strong>Model siap digunakan</strong>
              <p>
                {probe.actualModel || modelId} <span>· {probe.latencyMs} ms</span>
              </p>
              <small>Format respons chatbot sudah diperiksa.</small>
            </div>
          </div>
        )}
        {notice && (
          <div
            className={`ai-feedback ${notice.error ? 'is-error' : ''}`}
            role={notice.error ? 'alert' : 'status'}
          >
            {notice.text}
          </div>
        )}
        <div className="ai-editor-footer">
          {isNew ? (
            <button
              type="button"
              className="primary-button"
              disabled={
                name.trim().length < 2 ||
                !modelId.trim() ||
                (provider !== 'mock' && secret.trim().length < 8) ||
                (hasEndpoint && !/^https?:\/\//u.test(baseUrl)) ||
                timeoutMs < 1000 ||
                timeoutMs > 60000 ||
                maxOutputTokens < 16 ||
                maxOutputTokens > 32768
              }
              onClick={() => void save()}
            >
              {busy === 'save' ? 'Menyimpan…' : 'Simpan koneksi'}
              <Icon kind="arrow" />
            </button>
          ) : (
            <>
              <button
                type="button"
                className="secondary-button"
                disabled={
                  !modelId.trim() ||
                  editKey ||
                  (provider !== 'mock' && !connection.credentialConfigured) ||
                  (purpose === 'embedding' && modelId !== connection.modelId)
                }
                onClick={() => void test()}
              >
                {busy === 'test' ? 'Menguji model…' : 'Uji model'}
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={
                  (!(probe && probe.modelId === modelId) && !embeddingReady) ||
                  editKey ||
                  !integration ||
                  (active && modelId === connection.modelId)
                }
                onClick={() => void apply()}
              >
                {busy === 'apply'
                  ? 'Mengaktifkan…'
                  : active && modelId === connection.modelId
                    ? 'Model sedang aktif'
                    : 'Gunakan model ini'}
                <Icon kind="arrow" />
              </button>
            </>
          )}
        </div>
        {busy && (
          <p className="ai-progress" role="status">
            {busy === 'models'
              ? 'Menghubungi provider untuk mengambil daftar model…'
              : busy === 'test' || busy === 'apply'
                ? 'Memeriksa respons model. Proses dapat memerlukan beberapa detik…'
                : 'Menyimpan konfigurasi…'}
          </p>
        )}
        {!isNew && purpose === 'chat' && (
          <p className="ai-footer-note">
            Pengujian menggunakan request kecil. Model akan diperiksa kembali saat diaktifkan.
          </p>
        )}
        {!isNew && purpose === 'embedding' && modelId !== connection.modelId && (
          <p className="ai-inline-hint">
            Untuk model embedding berbeda, buat koneksi baru dan bangun ulang indeks knowledge.
          </p>
        )}
      </fieldset>
    </section>
  );
}

export default function AiSettingsPage() {
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [purpose, setPurpose] = useState<Purpose>('chat');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newVersion, setNewVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const refresh = useCallback(async () => {
    const [i, c] = await Promise.all([
      api<Integration>('/ai/integration'),
      api<Connection[]>('/ai/provider-connections')
    ]);
    setIntegration(i.data);
    setConnections(c.data);
    setError(null);
    return { integration: i.data, connections: c.data };
  }, []);
  useEffect(() => {
    let mounted = true;
    void refresh()
      .then((data) => {
        if (mounted)
          setSelectedId(
            data.integration.activeChatConnectionId ??
              data.connections.find((c) => c.purpose === 'chat')?.id ??
              null
          );
      })
      .catch(() => {
        if (mounted) setError('Pengaturan AI belum dapat dimuat. Coba muat ulang.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [refresh]);
  const activeId =
    purpose === 'chat'
      ? integration?.activeChatConnectionId
      : integration?.activeEmbeddingConnectionId;
  const activeConnection = connections.find((c) => c.id === activeId);
  const selected = connections.find((c) => c.id === selectedId && c.purpose === purpose) ?? null;
  const filtered = connections.filter((c) => c.purpose === purpose);
  const startNew = () => {
    setSelectedId(null);
    setNewVersion((v) => v + 1);
  };
  const changePurpose = (next: Purpose) => {
    setPurpose(next);
    const nextActive =
      next === 'chat'
        ? integration?.activeChatConnectionId
        : integration?.activeEmbeddingConnectionId;
    setSelectedId(nextActive ?? connections.find((c) => c.purpose === next)?.id ?? null);
  };
  return (
    <Shell eyebrow="PENGATURAN" title="Integrasi AI">
      <div className="ai-settings-page">
        <header className="ai-settings-hero">
          <div className="ai-hero-copy">
            <p className="eyebrow">PROVIDER & MODEL</p>
            <h2>Koneksi AI</h2>
            <p>Kelola akses API dan model untuk percakapan serta knowledge.</p>
          </div>
          <button type="button" className="primary-button ai-new-connection" onClick={startNew}>
            <span aria-hidden="true">+</span> Koneksi baru
          </button>
        </header>
        <div className="ai-page-toolbar">
          <div className="ai-tabs" role="group" aria-label="Fungsi koneksi">
            <button
              type="button"
              aria-pressed={purpose === 'chat'}
              onClick={() => changePurpose('chat')}
            >
              Chat<span>{connections.filter((c) => c.purpose === 'chat').length}</span>
            </button>
            <button
              type="button"
              aria-pressed={purpose === 'embedding'}
              onClick={() => changePurpose('embedding')}
            >
              Embedding<span>{connections.filter((c) => c.purpose === 'embedding').length}</span>
            </button>
          </div>
          <span className="ai-toolbar-note">
            <Icon kind="key" />
            Credential terenkripsi
          </span>
        </div>
        {error && (
          <div className="ai-feedback is-error" role="alert">
            {error}
            <button
              type="button"
              className="ai-text-button"
              onClick={() =>
                void refresh().catch(() => setError('Pengaturan belum dapat dimuat. Coba lagi.'))
              }
            >
              Muat ulang
            </button>
          </div>
        )}
        {loading ? (
          <section className="section-card ai-loading" role="status">
            Memuat koneksi AI…
          </section>
        ) : (
          <div className="ai-settings-layout">
            <aside className="ai-settings-sidebar" aria-label="Ringkasan integrasi AI">
              <section className="section-card ai-connections-card">
                <div className="ai-connections-heading">
                  <h3>Koneksi tersimpan</h3>
                  <SectionHelp topic="ai-saved" />
                  <span>{filtered.length}</span>
                </div>
                <label className="ai-mobile-connection-picker">
                  Koneksi tersimpan
                  <select
                    value={selectedId ?? ''}
                    onChange={(e) => (e.target.value ? setSelectedId(e.target.value) : startNew())}
                  >
                    <option value="">Koneksi baru</option>
                    {filtered.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.id === activeId ? ' · Aktif' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {filtered.length ? (
                  <div className="ai-connections-list">
                    {filtered.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`ai-connection-item ${selectedId === c.id ? 'is-selected' : ''}`}
                        aria-pressed={selectedId === c.id}
                        onClick={() => setSelectedId(c.id)}
                      >
                        <span className="ai-connection-initial">
                          {c.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="ai-connection-copy">
                          <strong>{c.name}</strong>
                          <small>{providers.find((p) => p.value === c.provider)?.label}</small>
                        </span>
                        {c.id === activeId && (
                          <span className="ai-connection-badge is-active">Aktif</span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="ai-empty">
                    <Icon kind="key" />
                    <strong>Belum ada koneksi</strong>
                    <p>Tambahkan provider untuk mulai menggunakan AI.</p>
                  </div>
                )}
              </section>
              <section className={`ai-active-card ${activeConnection ? 'is-active' : ''}`}>
                <div className="ai-active-heading">
                  <span className={`status-dot ${activeConnection ? 'healthy' : 'muted'}`} />
                  <span>{activeConnection ? 'MODEL AKTIF' : 'STATUS INTEGRASI'}</span>
                </div>
                <h3>{activeConnection?.modelId ?? 'Belum diaktifkan'}</h3>
                <SectionHelp topic="ai-active" />
                <p>
                  {activeConnection
                    ? activeConnection.name
                    : 'Aktifkan model setelah koneksi lolos pengujian.'}
                </p>
                {activeConnection && (
                  <>
                    <div className="ai-active-meta">
                      <span>Uji terakhir</span>
                      <strong>{dateLabel(activeConnection.lastTestedAt)}</strong>
                    </div>
                    <button
                      type="button"
                      className="ai-text-button ai-danger-link ai-deactivate"
                      disabled={deactivating}
                      onClick={() => {
                        if (!integration || deactivating) return;
                        setDeactivating(true);
                        void api('/ai/integration/deactivate', {
                          method: 'POST',
                          body: JSON.stringify({
                            purpose,
                            expectedRevision: integration.revision,
                            reason: 'Menonaktifkan koneksi AI melalui pengaturan integrasi'
                          })
                        })
                          .then(() => refresh())
                          .catch((e) => setError(friendlyError(e)))
                          .finally(() => setDeactivating(false));
                      }}
                    >
                      {deactivating ? 'Menonaktifkan…' : 'Nonaktifkan koneksi'}
                    </button>
                  </>
                )}
              </section>
              <div className="ai-security-note">
                <Icon kind="key" />
                <p>API key disimpan terenkripsi dan hanya digunakan oleh server.</p>
              </div>
            </aside>
            <ConnectionEditor
              key={
                selected ? `${selected.id}:${selected.revision}` : `new:${purpose}:${newVersion}`
              }
              connection={selected}
              purpose={purpose}
              integration={integration}
              onRefresh={async () => {
                await refresh();
              }}
              onSaved={async (id) => {
                await refresh();
                setSelectedId(id);
              }}
            />
          </div>
        )}
      </div>
    </Shell>
  );
}
