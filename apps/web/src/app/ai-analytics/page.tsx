'use client';

import { useEffect, useState } from 'react';

import { Shell } from '../../components/shell';
import { api } from '../../lib/api';

interface Analytics {
  windowDays: number;
  total: number;
  answered: number;
  answerRate: number;
  supportedRate: number;
  fallback: number;
  handoffs: number;
  unanswered: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cacheHits: number;
  estimatedCost: number;
  costCurrency: string;
  oldestQueueAgeMs: number;
  providers: Array<{
    provider: string;
    requests: number;
    errors: number;
    averageLatencyMs: number;
  }>;
}

export default function AiAnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  useEffect(() => {
    void api<Analytics>('/ai/analytics?days=7').then(({ data }) => setAnalytics(data));
  }, []);
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  return (
    <Shell eyebrow="PII-free observability" title="Analytics AI">
      <section className="metric-grid">
        <article className="metric-card">
          <span>Answer rate</span>
          <strong>{percent(analytics?.answerRate ?? 0)}</strong>
          <small>{analytics?.answered ?? 0} answered</small>
        </article>
        <article className="metric-card">
          <span>Supported</span>
          <strong>{percent(analytics?.supportedRate ?? 0)}</strong>
          <small>{analytics?.fallback ?? 0} fallback</small>
        </article>
        <article className="metric-card">
          <span>Handoff</span>
          <strong>{analytics?.handoffs ?? 0}</strong>
          <small>{analytics?.unanswered ?? 0} unanswered</small>
        </article>
        <article className="metric-card">
          <span>Latency p95</span>
          <strong>{analytics?.latencyP95Ms ?? 0} ms</strong>
          <small>p50 {analytics?.latencyP50Ms ?? 0} ms</small>
        </article>
        <article className="metric-card">
          <span>Token</span>
          <strong>{(analytics?.inputTokens ?? 0) + (analytics?.outputTokens ?? 0)}</strong>
          <small>{analytics?.cachedTokens ?? 0} cached</small>
        </article>
        <article className="metric-card">
          <span>Queue age</span>
          <strong>{Math.round((analytics?.oldestQueueAgeMs ?? 0) / 1000)} dtk</strong>
          <small>oldest pending</small>
        </article>
      </section>
      <section className="section-card">
        <p className="eyebrow">Provider operations</p>
        <h2>Latency dan error</h2>
        <div className="stack-list">
          {(analytics?.providers ?? []).map((provider) => (
            <article className="list-row" key={provider.provider}>
              <div>
                <strong>{provider.provider}</strong>
                <p>
                  {provider.requests} request · {provider.errors} non-answered
                </p>
              </div>
              <span className="state-badge">{provider.averageLatencyMs} ms</span>
            </article>
          ))}
        </div>
        <p className="muted">
          Analytics hanya menyimpan status, penggunaan, latency, dan estimasi biaya; isi pertanyaan
          serta identitas pelanggan tidak ditampilkan.
        </p>
      </section>
    </Shell>
  );
}
