'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { Shell } from '../../components/shell';
import { api, ApiError } from '../../lib/api';

interface TestCase {
  id: string;
  name: string;
  input: string;
  expectedBehavior: { status: string; requireCitation: boolean };
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
  const [expectedStatus, setExpectedStatus] = useState<'answered' | 'fallback' | 'handoff'>(
    'answered'
  );
  const [requireCitation, setRequireCitation] = useState(true);
  const [forbiddenTerms, setForbiddenTerms] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [caseResult, readinessResult, alertResult] = await Promise.all([
        api<TestCase[]>('/ai/test-cases'),
        api<Readiness[]>('/ai/release-readiness'),
        api<Alert[]>('/ai/alerts')
      ]);
      setCases(caseResult.data);
      setReadiness(readinessResult.data);
      setAlerts(alertResult.data);
    } catch {
      setLoadError('Data evaluasi tidak dapat dimuat. Perbarui halaman untuk mencoba lagi.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const createCase = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const terms = forbiddenTerms
      .split('\n')
      .map((term) => term.trim())
      .filter(Boolean);
    if (terms.length > 20 || terms.some((term) => term.length > 100)) {
      setNotice('Gunakan maksimal 20 frasa, masing-masing maksimal 100 karakter.');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await api('/ai/test-cases', {
        method: 'POST',
        body: JSON.stringify({
          name,
          input,
          expectedBehavior: {
            status: expectedStatus,
            requireCitation: expectedStatus === 'answered' && requireCitation,
            forbiddenTerms: terms,
            maxLatencyMs: 30000
          },
          reason: 'Menambahkan kasus evaluasi untuk release readiness'
        })
      });
      setNotice('Kasus uji disimpan.');
      await load();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Kasus uji gagal disimpan.');
    } finally {
      setBusy(false);
    }
  };
  const run = async () => {
    if (cases.length === 0 || busy) return;
    setBusy(true);
    setNotice(null);
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
    } finally {
      setBusy(false);
    }
  };
  const evaluate = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await api('/ai/release-readiness/evaluate', {
        method: 'POST',
        body: JSON.stringify({
          minimumScore: 0.9,
          reason: 'Menilai seluruh gate sebelum keputusan pilot'
        })
      });
      setNotice('Evaluasi kesiapan selesai. Tinjau hasil sebelum melanjutkan.');
      await load();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Evaluasi kesiapan gagal.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell eyebrow="Kesiapan operasional" title="Evaluasi dan kesiapan AI">
      {loadError ? (
        <p className="error-summary" role="alert">
          {loadError}
        </p>
      ) : null}
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      <div className="split-grid">
        <section className="section-card">
          <p className="eyebrow">Uji tanpa mengirim WhatsApp</p>
          <h2>Kasus uji</h2>
          <form onSubmit={(event) => void createCase(event)}>
            <label>
              Nama
              <input
                required
                minLength={3}
                maxLength={160}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Pertanyaan
              <textarea
                required
                minLength={2}
                maxLength={2000}
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
            </label>
            <label>
              Hasil yang diharapkan
              <select
                value={expectedStatus}
                onChange={(event) => setExpectedStatus(event.target.value as typeof expectedStatus)}
              >
                <option value="answered">Jawaban langsung (answered)</option>
                <option value="fallback">Klarifikasi / fallback</option>
                <option value="handoff">Diteruskan ke CS (handoff)</option>
              </select>
            </label>
            <label className="inline-checkbox">
              <input
                type="checkbox"
                checked={expectedStatus === 'answered' && requireCitation}
                disabled={expectedStatus !== 'answered'}
                onChange={(event) => setRequireCitation(event.target.checked)}
              />
              Wajib menyertakan sumber
            </label>
            <p>
              Untuk sapaan tanpa fakta layanan, pilih jawaban langsung dan matikan kewajiban sumber.
              Untuk pertanyaan yang perlu CS, pilih handoff.
            </p>
            <label>
              Kata atau frasa yang tidak boleh muncul (opsional)
              <textarea
                value={forbiddenTerms}
                onChange={(event) => setForbiddenTerms(event.target.value)}
                aria-describedby="forbidden-terms-help"
              />
            </label>
            <small id="forbidden-terms-help">
              Satu frasa per baris, maksimal 20 frasa dengan 100 karakter per frasa. Pemeriksaan ini
              tidak menilai kebenaran fakta secara otomatis.
            </small>
            <button className="primary-button" type="submit" disabled={busy || loading}>
              Simpan kasus uji
            </button>
          </form>
          <div
            className="stack-list phase5-fixed-list"
            role="region"
            tabIndex={0}
            aria-label="Daftar test case AI"
            aria-busy={loading}
          >
            {loading && cases.length === 0 ? (
              <p className="empty-state" role="status">
                Memuat kasus uji…
              </p>
            ) : null}
            {!loading && !loadError && cases.length === 0 ? (
              <p className="empty-state">
                Belum ada kasus uji. Tambahkan pertanyaan untuk memulai evaluasi.
              </p>
            ) : null}
            {cases.map((testCase) => (
              <article className="list-row" key={testCase.id}>
                <div>
                  <strong>{testCase.name}</strong>
                  <p>{testCase.input}</p>
                  <small>
                    Target: {testCase.expectedBehavior?.status ?? 'belum tersedia'}
                    {testCase.expectedBehavior?.requireCitation ? ' · sumber wajib' : ''}
                  </small>
                </div>
                <span className="state-badge">{testCase.runs[0]?.status ?? 'belum diuji'}</span>
              </article>
            ))}
          </div>
          <button
            className="secondary-button"
            disabled={loading || busy || Boolean(loadError) || cases.length === 0}
            onClick={() => void run()}
          >
            Jalankan semua
          </button>
        </section>
        <section className="section-card">
          <p className="eyebrow">Pemeriksaan sebelum digunakan</p>
          <h2>Kesiapan rilis</h2>
          <button
            className="primary-button"
            disabled={busy || loading || Boolean(loadError)}
            onClick={() => void evaluate()}
          >
            Evaluasi kesiapan
          </button>
          <div
            className="stack-list phase5-fixed-list"
            role="region"
            tabIndex={0}
            aria-label="Riwayat kesiapan rilis"
            aria-busy={loading}
          >
            {loading && readiness.length === 0 ? (
              <p className="empty-state" role="status">
                Memuat riwayat evaluasi…
              </p>
            ) : null}
            {!loading && !loadError && readiness.length === 0 ? (
              <p className="empty-state">
                Belum ada evaluasi kesiapan. Jalankan evaluasi untuk melihat hasil.
              </p>
            ) : null}
            {readiness.map((item) => (
              <article className="list-row" key={item.id}>
                <div>
                  <strong>{item.status}</strong>
                  <p>
                    {item.blockers.length
                      ? `Perlu diselesaikan: ${item.blockers.join(', ')}`
                      : 'Semua bukti pendukung tersedia'}
                  </p>
                </div>
                <span className="state-badge">pilot {item.pilotPercentage}%</span>
              </article>
            ))}
          </div>
        </section>
      </div>
      <section className="section-card">
        <p className="eyebrow">Status operasional</p>
        <h2>Peringatan aktif</h2>
        <div
          className="stack-list phase5-fixed-list"
          role="region"
          tabIndex={0}
          aria-label="Daftar peringatan operasional"
          aria-busy={loading}
        >
          {loading && alerts.length === 0 ? (
            <p className="empty-state" role="status">
              Memuat peringatan…
            </p>
          ) : null}
          {!loading && !loadError && alerts.length === 0 ? (
            <p className="empty-state">Tidak ada peringatan aktif.</p>
          ) : null}
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
      </section>
    </Shell>
  );
}
