'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Shell } from '../../components/shell';
import { useSession } from '../../components/use-session';
import { api } from '../../lib/api';

interface Dependency {
  name:
    'database' | 'redis' | 'worker' | 'minio' | 'whatsapp' | 'chat_provider' | 'embedding_provider';
  status: 'healthy' | 'degraded' | 'unavailable' | 'not_configured';
  latencyMs: number | null;
}

interface Overview {
  dependencies: Dependency[];
  sendingPaused: boolean;
  killSwitch: boolean;
  riskLevel: string;
  metricsAvailable: boolean;
  metrics: { inbound: number; outbound: number; failed: number; pending: number; handoffs: number };
  lastUpdatedAt: string;
  degraded: boolean;
}

const labels: Record<Dependency['name'], string> = {
  database: 'Database',
  redis: 'Redis',
  worker: 'Worker',
  minio: 'Knowledge storage',
  whatsapp: 'WhatsApp',
  chat_provider: 'AI chat',
  embedding_provider: 'AI embedding'
};
const stateLabels: Record<Dependency['status'], string> = {
  healthy: 'Sehat',
  degraded: 'Menurun',
  unavailable: 'Tidak tersedia',
  not_configured: 'Belum dikonfigurasi'
};
const metricDetails = [
  { key: 'inbound', label: 'Pesan masuk', detail: 'Diterima sistem' },
  { key: 'outbound', label: 'Pesan terkirim', detail: 'Tercatat terkirim' },
  { key: 'pending', label: 'Menunggu kirim', detail: 'Dalam antrean/outbox' },
  { key: 'failed', label: 'Perlu ditinjau', detail: 'Pengiriman gagal' },
  { key: 'handoffs', label: 'Handoff aktif', detail: 'Butuh operator' }
] as const;

const formatTimestamp = (value?: string): string =>
  value
    ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value)
      )
    : 'Belum diperbarui';

export default function OverviewPage() {
  const { user } = useSession();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [transport, setTransport] = useState<'SSE' | 'Polling'>('SSE');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const { data } = await api<Overview>('/overview');
      setOverview(data);
      setLoadError(null);
    } catch {
      setLoadError('Status terbaru belum dapat dimuat. Coba perbarui lagi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let polling: ReturnType<typeof setInterval> | undefined;
    let active = true;
    const safeLoad = async () => {
      try {
        const { data } = await api<Overview>('/overview');
        if (!active) return;
        setOverview(data);
        setLoadError(null);
      } catch {
        if (active) setLoadError('Status terbaru belum dapat dimuat. Coba perbarui lagi.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void safeLoad();
    const events = new EventSource('/api/admin/v1/events/stream');
    let failures = 0;
    events.onopen = () => {
      failures = 0;
      setTransport('SSE');
    };
    events.addEventListener('overview', (event) => {
      if (!active) return;
      setOverview(JSON.parse((event as MessageEvent).data) as Overview);
      setLoadError(null);
    });
    events.onerror = () => {
      failures += 1;
      if (failures < 3) return;
      events.close();
      setTransport('Polling');
      polling = setInterval(() => void safeLoad(), 15_000);
    };
    return () => {
      active = false;
      events.close();
      if (polling) clearInterval(polling);
    };
  }, []);

  const permissions = user?.permissions ?? [];
  const canOpen = (permission: string) => permissions.includes(permission);
  const needsAttention = Boolean(
    overview?.degraded ||
    overview?.sendingPaused ||
    overview?.killSwitch ||
    overview?.riskLevel === 'high'
  );
  const priorities = useMemo(() => {
    if (!overview) return [];
    const items: Array<{ title: string; description: string; href?: string | undefined }> = [];
    if (overview.killSwitch)
      items.push({
        title: 'Kill switch aktif',
        description: 'Pengiriman diblokir untuk melindungi operasi.',
        href: canOpen('safety.read') ? '/safety' : undefined
      });
    if (overview.sendingPaused)
      items.push({
        title: 'Pengiriman sedang dijeda',
        description: 'Pesan baru tidak akan diproses sebelum pengiriman dilanjutkan.',
        href: canOpen('safety.read') ? '/safety' : undefined
      });
    const dependency =
      overview.dependencies.find(({ status }) => status === 'unavailable') ??
      overview.dependencies.find(({ status }) => status === 'degraded');
    if (dependency) {
      const href =
        dependency.name === 'whatsapp' && canOpen('session.read')
          ? '/session'
          : (dependency.name === 'chat_provider' || dependency.name === 'embedding_provider') &&
              canOpen('ai.settings.manage')
            ? '/ai-settings'
            : undefined;
      items.push({
        title: `${labels[dependency.name]} ${stateLabels[dependency.status].toLowerCase()}`,
        description: 'Periksa detail layanan dan ikuti prosedur pemulihan yang berlaku.',
        href
      });
    }
    if (overview.metricsAvailable && overview.metrics.failed > 0)
      items.push({
        title: `${overview.metrics.failed.toLocaleString('id-ID')} pengiriman gagal`,
        description: 'Tinjau penyebabnya; jangan mengirim ulang status unknown secara otomatis.',
        href: canOpen('messages.read') ? '/outbox' : undefined
      });
    if (overview.metricsAvailable && overview.metrics.handoffs > 0)
      items.push({
        title: `${overview.metrics.handoffs.toLocaleString('id-ID')} handoff aktif`,
        description: 'Pastikan percakapan yang membutuhkan manusia sudah ditugaskan.',
        href: canOpen('handoffs.read') ? '/handoffs' : undefined
      });
    if (overview.metricsAvailable && overview.metrics.pending > 0)
      items.push({
        title: `${overview.metrics.pending.toLocaleString('id-ID')} pesan menunggu`,
        description: 'Pantau antrean dan status outbox sebelum mengambil tindakan.',
        href: canOpen('messages.read') ? '/outbox' : undefined
      });
    return items.slice(0, 5);
  }, [overview, permissions]);

  return (
    <Shell eyebrow="Operasional" title="Beranda">
      <section className="hero-row overview-hero">
        <div>
          <p className="eyebrow">Control room</p>
          <h2>
            {loading
              ? 'Memuat status operasional'
              : needsAttention
                ? 'Perlu perhatian'
                : 'Operasi terkendali'}
          </h2>
          <p>Ringkasan layanan, antrean pesan, dan pekerjaan operator untuk tenant ini.</p>
        </div>
        <div className="overview-hero-actions">
          <span
            className={`live-pill ${transport === 'Polling' ? 'is-fallback' : ''}`}
            aria-live="polite"
          >
            <span className={`status-dot ${transport === 'SSE' ? 'healthy' : 'warning'}`} />
            Update {transport === 'SSE' ? 'real-time' : 'berkala'}
          </span>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
          >
            {refreshing ? 'Memuat…' : 'Perbarui'}
          </button>
        </div>
      </section>
      {loadError ? (
        <div className="overview-alert" role="alert">
          <strong>Status belum sinkron.</strong> {loadError}
        </div>
      ) : null}
      <section className="overview-health-strip" aria-label="Status kontrol operasional">
        <article className={overview?.sendingPaused ? 'health-tile is-warning' : 'health-tile'}>
          <span>Pengiriman</span>
          <strong>{overview?.sendingPaused ? 'Dijeda' : 'Aktif'}</strong>
        </article>
        <article className={overview?.killSwitch ? 'health-tile is-danger' : 'health-tile'}>
          <span>Kill switch</span>
          <strong>{overview?.killSwitch ? 'Aktif' : 'Tidak aktif'}</strong>
        </article>
        <article
          className={overview?.riskLevel === 'high' ? 'health-tile is-warning' : 'health-tile'}
        >
          <span>Level risiko</span>
          <strong>{overview ? overview.riskLevel.replaceAll('_', ' ') : 'Memuat…'}</strong>
        </article>
        <article className="health-tile">
          <span>Terakhir diperbarui</span>
          <strong>{formatTimestamp(overview?.lastUpdatedAt)}</strong>
        </article>
      </section>
      <section className="metrics-grid overview-metrics" aria-label="Metrik pesan">
        {metricDetails.map(({ key, label, detail }) => (
          <article className="metric-card" key={key}>
            <span>{label}</span>
            <strong>
              {overview?.metricsAvailable ? overview.metrics[key].toLocaleString('id-ID') : '—'}
            </strong>
            <small>{overview?.metricsAvailable ? detail : 'Data belum tersedia'}</small>
          </article>
        ))}
      </section>
      <div className="overview-lower-grid">
        <section className="section-card overview-priorities" aria-labelledby="priority-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Prioritas operator</p>
              <h2 id="priority-heading">Perlu ditindaklanjuti</h2>
            </div>
            <small>{priorities.length ? `${priorities.length} item` : 'Tidak ada item'}</small>
          </div>
          {loading ? <p className="overview-empty">Memeriksa prioritas…</p> : null}
          {!loading && priorities.length === 0 ? (
            <p className="overview-empty">
              Tidak ada tindakan mendesak berdasarkan status saat ini.
            </p>
          ) : null}
          <div className="priority-list">
            {priorities.map((item) =>
              item.href ? (
                <Link className="priority-item" href={item.href} key={item.title}>
                  <span className="priority-marker" aria-hidden="true" />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.description}</small>
                  </span>
                  <span className="priority-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              ) : (
                <article className="priority-item" key={item.title}>
                  <span className="priority-marker" aria-hidden="true" />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.description}</small>
                  </span>
                </article>
              )
            )}
          </div>
        </section>
        <section className="section-card" aria-labelledby="dependency-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Kesehatan sistem</p>
              <h2 id="dependency-heading">Layanan terhubung</h2>
            </div>
            <small>{overview?.dependencies.length ?? 0} layanan</small>
          </div>
          <div className="dependency-grid">
            {overview?.dependencies.map((item) => (
              <article className={`dependency dependency-${item.status}`} key={item.name}>
                <span
                  className={`status-dot ${item.status === 'healthy' ? 'healthy' : item.status === 'not_configured' ? 'muted' : 'warning'}`}
                />
                <div>
                  <strong>{labels[item.name]}</strong>
                  <small>
                    {stateLabels[item.status]}
                    {item.latencyMs === null ? '' : ` · ${item.latencyMs} ms`}
                  </small>
                </div>
              </article>
            )) ?? <p className="overview-empty">Memuat status layanan…</p>}
          </div>
        </section>
      </div>
    </Shell>
  );
}
