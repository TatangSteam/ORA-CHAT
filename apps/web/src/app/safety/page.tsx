'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { AppIcon } from '../../components/app-icon';
import { Shell } from '../../components/shell';
import { api, ApiError } from '../../lib/api';

interface SafetyState {
  sendingPaused: boolean;
  killSwitch: boolean;
  riskLevel: string;
  reason: string | null;
  revision: number;
  updatedAt: string;
}

export default function SafetyPage() {
  const [state, setState] = useState<SafetyState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setState((await api<SafetyState>('/safety/stats')).data);
    } catch {
      setError('Status pengiriman tidak dapat dimuat. Perbarui halaman untuk mencoba lagi.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const mutate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!state || loading || busy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const action = state.sendingPaused ? 'resume' : 'pause';
    setBusy(true);
    setError(null);
    try {
      await api(`/safety/${action}`, {
        method: 'POST',
        body: JSON.stringify({ reason: form.get('reason'), expectedRevision: state.revision })
      });
      setNotice(action === 'pause' ? 'Pengiriman dijeda.' : 'Pengiriman dilanjutkan.');
      formElement.reset();
      await load();
    } catch (error) {
      setError(error instanceof ApiError ? error.message : 'Aksi gagal.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell eyebrow="Kontrol pengiriman" title="Keamanan">
      {error ? (
        <p className="error-summary" role="alert">
          {error}
        </p>
      ) : null}
      <section className="split-grid">
        <article className="section-card">
          <p className="eyebrow">Status pengiriman</p>
          <div className="safety-status" aria-busy={loading}>
            <span
              className={`status-icon ${state ? (state.sendingPaused ? 'danger' : 'safe') : ''}`}
            >
              <AppIcon name={state && !state.sendingPaused ? 'readiness' : 'safety'} size={24} />
            </span>
            <div>
              <h2>
                {state
                  ? state.sendingPaused
                    ? 'Pengiriman dijeda'
                    : 'Pengiriman aktif'
                  : loading
                    ? 'Memuat status pengiriman…'
                    : 'Status belum tersedia'}
              </h2>
              <p>
                Tingkat risiko:{' '}
                <strong>{state?.riskLevel.replaceAll('_', ' ') ?? 'Belum tersedia'}</strong>
              </p>
            </div>
          </div>
          <dl>
            <div>
              <dt>Alasan terakhir</dt>
              <dd>{state ? (state.reason ?? 'Belum ada perubahan') : 'Belum tersedia'}</dd>
            </div>
            <div>
              <dt>Revisi</dt>
              <dd>{state?.revision ?? 'Belum tersedia'}</dd>
            </div>
          </dl>
        </article>
        <article className="section-card">
          <p className="eyebrow">Aksi terkontrol</p>
          <h2>
            {state
              ? state.sendingPaused
                ? 'Lanjutkan pengiriman'
                : 'Jeda pengiriman'
              : 'Atur pengiriman'}
          </h2>
          <p>Isi alasan untuk mengubah status pengiriman.</p>
          {notice ? (
            <div className="notice" role="status">
              {notice}
            </div>
          ) : null}
          <form onSubmit={(event) => void mutate(event)}>
            <label>
              Alasan
              <textarea name="reason" minLength={8} maxLength={500} required />
            </label>
            <button
              className={state?.sendingPaused ? 'primary-button' : 'danger-button'}
              type="submit"
              disabled={!state || loading || busy}
            >
              {busy ? 'Menyimpan…' : state?.sendingPaused ? 'Lanjutkan' : 'Jeda sekarang'}
            </button>
          </form>
        </article>
      </section>
    </Shell>
  );
}
