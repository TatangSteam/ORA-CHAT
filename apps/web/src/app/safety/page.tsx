'use client';

import { type FormEvent, useEffect, useState } from 'react';

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
  const load = () => void api<SafetyState>('/safety/stats').then(({ data }) => setState(data));
  useEffect(load, []);
  const mutate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const action = state?.sendingPaused ? 'resume' : 'pause';
    try {
      await api(`/safety/${action}`, {
        method: 'POST',
        body: JSON.stringify({ reason: form.get('reason'), expectedRevision: state?.revision ?? 0 })
      });
      setNotice(action === 'pause' ? 'Pengiriman dijeda.' : 'Pengiriman dilanjutkan.');
      event.currentTarget.reset();
      load();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Aksi gagal.');
    }
  };
  return (
    <Shell eyebrow="Guardrail" title="Keamanan">
      <section className="split-grid">
        <article className="section-card">
          <p className="eyebrow">Sending control</p>
          <div className="safety-status">
            <span className={`status-icon ${state?.sendingPaused ? 'danger' : 'safe'}`}>
              {state?.sendingPaused ? 'Ⅱ' : '✓'}
            </span>
            <div>
              <h2>{state?.sendingPaused ? 'Pengiriman dijeda' : 'Pengiriman aktif'}</h2>
              <p>
                Risk level: <strong>{state?.riskLevel ?? '—'}</strong>
              </p>
            </div>
          </div>
          <dl>
            <div>
              <dt>Alasan terakhir</dt>
              <dd>{state?.reason ?? 'Belum ada perubahan'}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>{state?.revision ?? '—'}</dd>
            </div>
          </dl>
        </article>
        <article className="section-card">
          <p className="eyebrow">Aksi terkontrol</p>
          <h2>{state?.sendingPaused ? 'Lanjutkan pengiriman' : 'Jeda pengiriman'}</h2>
          <p>Alasan wajib diisi dan request memakai revision terbaru.</p>
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
            >
              {state?.sendingPaused ? 'Lanjutkan' : 'Jeda sekarang'}
            </button>
          </form>
        </article>
      </section>
    </Shell>
  );
}
