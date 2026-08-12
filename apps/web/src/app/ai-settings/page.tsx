'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { Shell } from '../../components/shell';
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

const transportFor = (provider: Provider) =>
  provider === 'openai-compatible'
    ? 'compatible'
    : provider === 'openclaw-gateway'
      ? 'gateway'
      : 'native';

const ConnectionCard = ({
  connection,
  active,
  integrationRevision,
  refresh
}: {
  connection: Connection;
  active: boolean;
  integrationRevision: number;
  refresh: () => Promise<void>;
}) => {
  const [modelId, setModelId] = useState(connection.modelId);
  const [baseUrl, setBaseUrl] = useState(connection.baseUrl ?? '');
  const [dimensions, setDimensions] = useState(String(connection.dimensions ?? ''));
  const [secret, setSecret] = useState('');
  const [reason, setReason] = useState('Perubahan konfigurasi provider telah ditinjau');
  const [models, setModels] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const action = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await operation();
      setSecret('');
      setNotice(success);
      await refresh();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Aksi gagal dijalankan.');
    } finally {
      setBusy(false);
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    return action(
      () =>
        api(`/ai/provider-connections/${connection.id}`, {
          method: 'POST',
          body: JSON.stringify({
            name: connection.name,
            purpose: connection.purpose,
            provider: connection.provider,
            transport: connection.transport,
            baseUrl: baseUrl || null,
            modelId,
            dimensions: connection.purpose === 'embedding' ? Number(dimensions) : null,
            taskType: connection.taskType,
            timeoutMs: connection.timeoutMs,
            maxRetries: connection.maxRetries,
            maxOutputTokens: connection.maxOutputTokens,
            generationConfig: connection.generationConfig,
            expectedRevision: connection.revision,
            reason
          })
        }),
      'Konfigurasi disimpan. Uji ulang diperlukan sebelum aktivasi.'
    );
  };

  return (
    <article className={`section-card provider-card ${active ? 'provider-active' : ''}`}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{connection.provider}</p>
          <h3>{connection.name}</h3>
        </div>
        <span className={`state-badge health-${connection.healthState}`}>
          {active ? 'aktif' : connection.healthState.replaceAll('_', ' ')}
        </span>
      </div>
      <form onSubmit={(event) => void save(event)}>
        {connection.baseUrl !== null ? (
          <label>
            Base URL
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} required />
          </label>
        ) : null}
        <label>
          Model
          <input
            list={`models-${connection.id}`}
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            required
          />
          <datalist id={`models-${connection.id}`}>
            {models.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </label>
        {connection.purpose === 'embedding' ? (
          <label>
            Dimensi embedding
            <input
              type="number"
              min="1"
              max="16384"
              value={dimensions}
              onChange={(event) => setDimensions(event.target.value)}
              required
            />
          </label>
        ) : null}
        <label>
          Alasan perubahan
          <input
            minLength={8}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </label>
        <div className="action-row wrap-actions">
          <button className="secondary-button" disabled={busy} type="submit">
            Simpan konfigurasi
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            type="button"
            onClick={() =>
              void action(async () => {
                const response = await api<string[]>(
                  `/ai/provider-connections/${connection.id}/models`
                );
                setModels(response.data);
              }, 'Daftar model dimuat dari server.')
            }
          >
            Ambil model
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            type="button"
            onClick={() =>
              void action(
                () =>
                  api(`/ai/provider-connections/${connection.id}/test`, {
                    method: 'POST',
                    body: JSON.stringify({ expectedRevision: connection.revision, reason })
                  }),
                'Uji koneksi selesai.'
              )
            }
          >
            Uji server-side
          </button>
          <button
            className={active ? 'danger-button' : 'primary-button'}
            disabled={busy || (!active && connection.healthState !== 'ready')}
            type="button"
            onClick={() =>
              void action(
                () =>
                  api(`/ai/integration/${active ? 'deactivate' : 'activate'}`, {
                    method: 'POST',
                    body: JSON.stringify({
                      purpose: connection.purpose,
                      ...(active ? {} : { connectionId: connection.id }),
                      expectedRevision: integrationRevision,
                      reason
                    })
                  }),
                active ? 'Integrasi dinonaktifkan.' : 'Integrasi diaktifkan.'
              )
            }
          >
            {active ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
        </div>
      </form>
      {connection.provider !== 'mock' ? (
        <div className="credential-panel">
          <label>
            Ganti kredensial (write-only)
            <input
              autoComplete="new-password"
              type="password"
              value={secret}
              placeholder={
                connection.credentialConfigured
                  ? 'Kosong = tetap gunakan yang tersimpan'
                  : 'Belum tersimpan'
              }
              onChange={(event) => setSecret(event.target.value)}
            />
          </label>
          <div className="action-row wrap-actions">
            <button
              className="secondary-button"
              disabled={busy || secret.length < 8}
              type="button"
              onClick={() =>
                void action(
                  () =>
                    api(`/ai/provider-connections/${connection.id}/credential`, {
                      method: 'POST',
                      body: JSON.stringify({
                        credential: secret,
                        expectedRevision: connection.revision,
                        reason
                      })
                    }),
                  'Kredensial diganti dan koneksi dinonaktifkan sampai diuji ulang.'
                )
              }
            >
              Simpan kredensial baru
            </button>
            <button
              className="danger-button"
              disabled={busy || !connection.credentialConfigured}
              type="button"
              onClick={() =>
                void action(
                  () =>
                    api(`/ai/provider-connections/${connection.id}/credential/delete`, {
                      method: 'POST',
                      body: JSON.stringify({ expectedRevision: connection.revision, reason })
                    }),
                  'Kredensial dicabut.'
                )
              }
            >
              Cabut kredensial
            </button>
          </div>
          <small>
            {connection.credentialConfigured
              ? `Tersimpan terenkripsi${connection.credentialRotatedAt ? ` · rotasi ${new Date(connection.credentialRotatedAt).toLocaleString('id-ID')}` : ''}`
              : 'Tidak ada kredensial tersimpan'}
          </small>
        </div>
      ) : null}
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
    </article>
  );
};

export default function AiSettingsPage() {
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [purpose, setPurpose] = useState<Purpose>('chat');
  const [provider, setProvider] = useState<Provider>('mock');
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [integrationResult, connectionsResult] = await Promise.all([
      api<Integration>('/ai/integration'),
      api<Connection[]>('/ai/provider-connections')
    ]);
    setIntegration(integrationResult.data);
    setConnections(connectionsResult.data);
  }, []);

  useEffect(() => {
    void refresh().catch(() => setNotice('Konfigurasi AI tidak dapat dimuat.'));
  }, [refresh]);

  useEffect(() => {
    if (purpose === 'embedding' && provider === 'anthropic') setProvider('mock');
  }, [provider, purpose]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const credential = String(form.get('credential') ?? '');
      await api('/ai/provider-connections', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          purpose,
          provider,
          transport: transportFor(provider),
          baseUrl: ['openai-compatible', 'openclaw-gateway'].includes(provider)
            ? form.get('baseUrl')
            : null,
          modelId: form.get('modelId'),
          dimensions: purpose === 'embedding' ? Number(form.get('dimensions')) : null,
          taskType: purpose === 'embedding' ? 'RETRIEVAL_QUERY' : null,
          timeoutMs: 15000,
          maxRetries: 1,
          maxOutputTokens: 512,
          generationConfig: purpose === 'chat' ? { temperature: 0.2, topP: 0.9 } : {},
          ...(credential ? { credential } : {}),
          reason: form.get('reason')
        })
      });
      event.currentTarget.reset();
      setNotice('Koneksi dibuat. Jalankan uji sebelum aktivasi.');
      await refresh();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Koneksi gagal dibuat.');
    }
  };

  return (
    <Shell eyebrow="Provider control" title="Integrasi AI">
      <section className="hero-row ai-hero">
        <div>
          <p className="eyebrow">Vendor-neutral runtime</p>
          <h2>Chat dan embedding dapat dipilih terpisah</h2>
          <p>
            Kredensial bersifat write-only. Aktivasi hanya tersedia setelah uji server-side pada
            revisi konfigurasi yang sama.
          </p>
        </div>
        <span className="state-badge">{integration?.status ?? 'memuat'}</span>
      </section>

      {notice ? (
        <div className="notice" role="status">
          {notice}
        </div>
      ) : null}

      <div className="ai-purpose-grid">
        {(['chat', 'embedding'] as const).map((item) => {
          const activeId =
            item === 'chat'
              ? integration?.activeChatConnectionId
              : integration?.activeEmbeddingConnectionId;
          return (
            <section className="provider-column" key={item}>
              <div className="section-heading purpose-heading">
                <div>
                  <p className="eyebrow">{item === 'chat' ? 'Generation' : 'Retrieval'}</p>
                  <h2>{item === 'chat' ? 'Provider chat' : 'Provider embedding'}</h2>
                </div>
                <span className={`status-dot ${activeId ? 'healthy' : 'muted'}`} />
              </div>
              {connections
                .filter((connection) => connection.purpose === item)
                .map((connection) => (
                  <ConnectionCard
                    key={connection.id}
                    connection={connection}
                    active={connection.id === activeId}
                    integrationRevision={integration?.revision ?? 0}
                    refresh={refresh}
                  />
                ))}
              {connections.every((connection) => connection.purpose !== item) ? (
                <div className="empty-state">Belum ada koneksi {item}.</div>
              ) : null}
            </section>
          );
        })}
      </div>

      <section className="section-card create-provider-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Koneksi baru</p>
            <h2>Tambahkan provider</h2>
          </div>
          <span className="state-badge">draft</span>
        </div>
        <form className="provider-form-grid" onSubmit={(event) => void create(event)}>
          <label>
            Nama koneksi
            <input name="name" minLength={2} maxLength={160} required />
          </label>
          <label>
            Fungsi
            <select value={purpose} onChange={(event) => setPurpose(event.target.value as Purpose)}>
              <option value="chat">Chat</option>
              <option value="embedding">Embedding</option>
            </select>
          </label>
          <label>
            Provider
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as Provider)}
            >
              <option value="mock">Mock aman</option>
              <option value="openai">OpenAI native</option>
              <option value="anthropic" disabled={purpose === 'embedding'}>
                Anthropic native
              </option>
              <option value="gemini">Gemini native</option>
              <option value="openai-compatible">OpenAI-compatible</option>
              <option value="openclaw-gateway">OpenClaw gateway</option>
            </select>
          </label>
          <label>
            Model
            <input name="modelId" defaultValue={provider === 'mock' ? 'mock-safe' : ''} required />
          </label>
          {['openai-compatible', 'openclaw-gateway'].includes(provider) ? (
            <label>
              Base URL
              <input
                name="baseUrl"
                type="url"
                placeholder={
                  provider === 'openclaw-gateway'
                    ? 'http://openclaw:18789/v1'
                    : 'https://provider.example/v1'
                }
                required
              />
            </label>
          ) : null}
          {purpose === 'embedding' ? (
            <label>
              Dimensi
              <input
                name="dimensions"
                type="number"
                min="1"
                max="16384"
                defaultValue="1536"
                required
              />
            </label>
          ) : null}
          {provider !== 'mock' ? (
            <label>
              Kredensial awal (write-only)
              <input name="credential" type="password" minLength={8} autoComplete="new-password" />
            </label>
          ) : null}
          <label className="span-full">
            Alasan
            <input
              name="reason"
              minLength={8}
              maxLength={500}
              defaultValue="Menambahkan koneksi provider yang telah disetujui"
              required
            />
          </label>
          <div className="span-full">
            <button className="primary-button" type="submit">
              Buat koneksi
            </button>
          </div>
        </form>
      </section>
    </Shell>
  );
}
