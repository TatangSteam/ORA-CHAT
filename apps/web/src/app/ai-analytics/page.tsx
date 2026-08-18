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
  totalTokens: number;
  cachedTokens: number;
  providerRequests: number;
  meteredRequests: number;
  usageCoverageRate: number;
  averageTokensPerRequest: number;
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

const INPUT_USD_PER_MILLION = 2;
const OUTPUT_USD_PER_MILLION = 12;
const USD_TO_IDR = 16_500;
const SELLING_MULTIPLIER = 1.25;

export default function AiAnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setError(null);
    void api<Analytics>(`/ai/analytics?days=${days}`)
      .then(({ data }) => {
        if (active) setAnalytics(data);
      })
      .catch(() => {
        if (active) setError('Meter token tidak dapat dimuat.');
      });
    return () => {
      active = false;
    };
  }, [days]);
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const number = (value: number) => new Intl.NumberFormat('id-ID').format(value);
  const rupiah = (value: number, maximumFractionDigits = 0) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits
    }).format(value);
  const totalTokens = analytics?.totalTokens ?? 0;
  const inputTokens = analytics?.inputTokens ?? 0;
  const outputTokens = analytics?.outputTokens ?? 0;
  const inputShare = totalTokens ? ((analytics?.inputTokens ?? 0) / totalTokens) * 100 : 0;
  const outputShare = totalTokens ? ((analytics?.outputTokens ?? 0) / totalTokens) * 100 : 0;
  const inputSellingRate = (INPUT_USD_PER_MILLION / 1_000_000) * USD_TO_IDR * SELLING_MULTIPLIER;
  const outputSellingRate = (OUTPUT_USD_PER_MILLION / 1_000_000) * USD_TO_IDR * SELLING_MULTIPLIER;
  const sellingPriceIdr = inputTokens * inputSellingRate + outputTokens * outputSellingRate;
  return (
    <Shell eyebrow="PII-free observability" title="Analytics AI">
      <section className="section-card token-usage-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">API token meter</p>
            <h2>Pemakaian token provider</h2>
          </div>
          <div aria-label="Pilih periode token" className="token-period-selector">
            {[1, 7, 30, 90].map((option) => (
              <button
                aria-pressed={days === option}
                className={days === option ? 'is-active' : ''}
                key={option}
                onClick={() => setDays(option)}
                type="button"
              >
                {option}H
              </button>
            ))}
          </div>
        </div>
        {error ? (
          <p className="error-summary" role="alert">
            {error}
          </p>
        ) : (
          <div className="token-usage-grid">
            <div className="token-total-block">
              <strong>{number(totalTokens)}</strong>
              <span>token dipakai dalam {days} hari terakhir</span>
              <small>
                Rata-rata {number(analytics?.averageTokensPerRequest ?? 0)} token per request
              </small>
            </div>
            <div className="token-meter-block">
              <div
                aria-label={`${number(analytics?.inputTokens ?? 0)} input token dan ${number(analytics?.outputTokens ?? 0)} output token`}
                className="token-meter-track"
                role="img"
              >
                <span className="token-meter-input" style={{ width: `${inputShare}%` }} />
                <span className="token-meter-output" style={{ width: `${outputShare}%` }} />
              </div>
              <div className="token-meter-legend">
                <span>
                  <i className="legend-input" /> Input{' '}
                  <strong>{number(analytics?.inputTokens ?? 0)}</strong>
                </span>
                <span>
                  <i className="legend-output" /> Output{' '}
                  <strong>{number(analytics?.outputTokens ?? 0)}</strong>
                </span>
                <span>
                  Cached <strong>{number(analytics?.cachedTokens ?? 0)}</strong>
                </span>
              </div>
              <div className="token-coverage-row">
                <span>
                  Data usage {analytics?.meteredRequests ?? 0}/{analytics?.providerRequests ?? 0}{' '}
                  request API
                </span>
                <strong>{percent(analytics?.usageCoverageRate ?? 0)}</strong>
              </div>
              <div
                aria-label={`Kelengkapan data usage ${percent(analytics?.usageCoverageRate ?? 0)}`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={Math.round((analytics?.usageCoverageRate ?? 0) * 100)}
                className="token-coverage-track"
                role="progressbar"
              >
                <span style={{ width: percent(analytics?.usageCoverageRate ?? 0) }} />
              </div>
            </div>
          </div>
        )}
        <div className="token-selling-panel">
          <div className="token-selling-summary">
            <div>
              <p className="eyebrow">Estimasi tagihan</p>
              <h3>Harga jual pemakaian AI</h3>
              <small>
                Untuk {number(totalTokens)} token dalam {days} hari terakhir
              </small>
            </div>
            <strong>{rupiah(sellingPriceIdr)}</strong>
          </div>
          <div aria-label="Harga jual token" className="token-selling-rates">
            <span>
              Input <strong>{rupiah(inputSellingRate, 6)}</strong> / token
            </span>
            <span>
              Output <strong>{rupiah(outputSellingRate, 6)}</strong> / token
            </span>
          </div>
        </div>
        <p className="token-meter-note">
          Meter menghitung token yang dilaporkan provider untuk request chat. Angka ini menunjukkan
          pemakaian, bukan sisa saldo atau batas kuota akun provider.
        </p>
      </section>
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
          <span>Token API</span>
          <strong>{number(totalTokens)}</strong>
          <small>{analytics?.meteredRequests ?? 0} request terukur</small>
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
