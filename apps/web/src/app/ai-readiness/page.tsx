'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { Shell } from '../../components/shell';
import { api, ApiError } from '../../lib/api';

interface TestCase {
  id: string;
  name: string;
  input: string;
  runs: Array<{ id: string; status: string }>;
}
interface Readiness {
  id: string;
  status: string;
  revision: number;
  pilotPercentage: number;
  blockers: string[];
  evaluatedAt: string;
}
interface Alert {
  id: string;
  severity: string;
  code: string;
  summary: string;
  status: string;
}

export default function AiReadinessPage() {
  const [cases, setCases] = useState<TestCase[]>([]);
  const [readiness, setReadiness] = useState<Readiness[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [name, setName] = useState('Grounded answer');
  const [input, setInput] = useState('Apa informasi utama yang tersedia?');
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [caseResult, readinessResult, alertResult] = await Promise.all([
      api<TestCase[]>('/ai/test-cases'),
      api<Readiness[]>('/ai/release-readiness'),
      api<Alert[]>('/ai/alerts')
    ]);
    setCases(caseResult.data);
    setReadiness(readinessResult.data);
    setAlerts(alertResult.data);
  }, []);
  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  const createCase = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api('/ai/test-cases', {
        method: 'POST',
        body: JSON.stringify({
          name,
          input,
          expectedBehavior: {
            status: 'answered',
            requireCitation: true,
            forbiddenTerms: [],
            maxLatencyMs: 30000
          },
          reason: 'Menambahkan kasus evaluasi untuk release readiness'
        })
      });
      setNotice('Test case disimpan.');
      await load();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Test case gagal.');
    }
  };
  const run = async () => {
    if (cases.length === 0) return;
    try {
      await api('/ai/test-runs', {
        method: 'POST',
        body: JSON.stringify({
          testCaseIds: cases.map(({ id }) => id),
          reason: 'Menjalankan batch evaluasi sebelum pilot'
        })
      });
      setNotice('Batch evaluasi selesai tanpa mengirim pesan WhatsApp.');
      await load();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Evaluasi gagal.');
    }
  };
  const evaluate = async () => {
    try {
      await api('/ai/release-readiness/evaluate', {
        method: 'POST',
        body: JSON.stringify({
          minimumScore: 0.9,
          reason: 'Menilai seluruh gate sebelum keputusan pilot'
        })
      });
      setNotice('Readiness dievaluasi secara fail-closed.');
      await load();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Readiness gagal.');
    }
  };
  return (
    <Shell eyebrow="Pilot control" title="Evaluation & readiness">
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      <div className="split-grid">
        <section className="section-card">
          <p className="eyebrow">No-send dataset</p>
          <h2>Test cases</h2>
          <form onSubmit={(event) => void createCase(event)}>
            <label>
              Nama
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Pertanyaan
              <textarea value={input} onChange={(event) => setInput(event.target.value)} />
            </label>
            <button className="primary-button" type="submit">
              Simpan test case
            </button>
          </form>
          <div
            className="stack-list phase5-fixed-list"
            role="region"
            tabIndex={0}
            aria-label="Daftar test case AI"
          >
            {cases.map((testCase) => (
              <article className="list-row" key={testCase.id}>
                <div>
                  <strong>{testCase.name}</strong>
                  <p>{testCase.input}</p>
                </div>
                <span className="state-badge">{testCase.runs[0]?.status ?? 'belum diuji'}</span>
              </article>
            ))}
          </div>
          <button
            className="secondary-button"
            disabled={cases.length === 0}
            onClick={() => void run()}
          >
            Jalankan semua
          </button>
        </section>
        <section className="section-card">
          <p className="eyebrow">Fail closed</p>
          <h2>Release gate</h2>
          <button className="primary-button" onClick={() => void evaluate()}>
            Evaluasi readiness
          </button>
          <div
            className="stack-list phase5-fixed-list"
            role="region"
            tabIndex={0}
            aria-label="Riwayat release readiness"
          >
            {readiness.map((item) => (
              <article className="list-row" key={item.id}>
                <div>
                  <strong>{item.status}</strong>
                  <p>
                    {item.blockers.length
                      ? `Blocker: ${item.blockers.join(', ')}`
                      : 'Semua evidence tersedia'}
                  </p>
                </div>
                <span className="state-badge">pilot {item.pilotPercentage}%</span>
              </article>
            ))}
          </div>
        </section>
      </div>
      <section className="section-card">
        <p className="eyebrow">Operational alerts</p>
        <h2>Alert aktif</h2>
        <div
          className="stack-list phase5-fixed-list"
          role="region"
          tabIndex={0}
          aria-label="Daftar operational alert"
        >
          {alerts.map((alert) => (
            <article className="list-row" key={alert.id}>
              <div>
                <strong>{alert.code}</strong>
                <p>{alert.summary}</p>
              </div>
              <span className="state-badge">
                {alert.severity} · {alert.status}
              </span>
            </article>
          ))}
        </div>
        {alerts.length === 0 ? <p className="muted">Tidak ada alert aktif.</p> : null}
      </section>
    </Shell>
  );
}
