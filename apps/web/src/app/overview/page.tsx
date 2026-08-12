'use client';

import { useEffect, useState } from 'react';

import { Shell } from '../../components/shell';
import { api } from '../../lib/api';

interface Overview {
  dependencies: Array<{ name: string; status: string; latencyMs: number | null }>;
  sendingPaused: boolean;
  killSwitch: boolean;
  riskLevel: string;
  metricsAvailable: boolean;
  metrics: { inbound: number; outbound: number; failed: number; pending: number; handoffs: number };
  lastUpdatedAt: string;
  degraded: boolean;
}

const labels: Record<string, string> = {
  database: 'Database',
  redis: 'Redis',
  worker: 'Worker',
  minio: 'MinIO',
  whatsapp: 'WhatsApp',
  chat_provider: 'Chat provider',
  embedding_provider: 'Embedding provider'
};

export default function OverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [transport, setTransport] = useState<'SSE' | 'Polling'>('SSE');

  useEffect(() => {
    let polling: ReturnType<typeof setInterval> | undefined;
    const load = () => void api<Overview>('/overview').then(({ data }) => setOverview(data));
    load();
    const events = new EventSource('/api/admin/v1/events/stream');
    let consecutiveFailures = 0;
    events.onopen = () => {
      consecutiveFailures = 0;
      setTransport('SSE');
    };
    events.addEventListener('overview', (event) =>
      setOverview(JSON.parse((event as MessageEvent).data) as Overview)
    );
    events.onerror = () => {
      consecutiveFailures += 1;
      if (consecutiveFailures < 3) return;
      events.close();
      setTransport('Polling');
      polling = setInterval(load, 15_000);
    };
    return () => {
      events.close();
      if (polling) clearInterval(polling);
    };
  }, []);

  return (
    <Shell eyebrow="Operasional" title="Beranda">
      <section className="hero-row">
        <div>
          <p className="eyebrow">Status sistem</p>
          <h2>{overview?.degraded ? 'Perlu perhatian' : 'Semua terkendali'}</h2>
          <p>Ringkasan dependency dan kontrol pengiriman secara real-time.</p>
        </div>
        <div className="live-pill">
          <span className="status-dot healthy" />
          {transport}
        </div>
      </section>
      <section className="metrics-grid" aria-label="Metrik pesan">
        {Object.entries(
          overview?.metrics ?? { inbound: 0, outbound: 0, failed: 0, pending: 0, handoffs: 0 }
        ).map(([key, value]) => (
          <article className="metric-card" key={key}>
            <span>{key}</span>
            <strong>{overview?.metricsAvailable ? value.toLocaleString('id-ID') : '—'}</strong>
            <small>{overview?.metricsAvailable ? 'Total tersimpan' : 'Belum tersedia'}</small>
          </article>
        ))}
      </section>
      <section className="section-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Dependency</p>
            <h2>Kesehatan layanan</h2>
          </div>
          <small>
            Diperbarui{' '}
            {overview ? new Date(overview.lastUpdatedAt).toLocaleTimeString('id-ID') : '—'}
          </small>
        </div>
        <div className="dependency-grid">
          {overview?.dependencies.map((item) => (
            <article className="dependency" key={item.name}>
              <span
                className={`status-dot ${item.status === 'healthy' ? 'healthy' : item.status === 'not_configured' ? 'muted' : 'warning'}`}
              />
              <div>
                <strong>{labels[item.name] ?? item.name}</strong>
                <small>
                  {item.status.replace('_', ' ')}
                  {item.latencyMs === null ? '' : ` · ${item.latencyMs} ms`}
                </small>
              </div>
            </article>
          )) ?? <p>Memuat status…</p>}
        </div>
      </section>
    </Shell>
  );
}
