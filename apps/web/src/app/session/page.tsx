'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Shell } from '../../components/shell';
import { api, ApiError } from '../../lib/api';

interface SessionState {
  adapter: string;
  state: string;
  connectedAt: string | null;
  lastHeartbeatAt: string | null;
  lastErrorCode: string | null;
  revision: number;
  updatedAt: string;
}

interface ActiveQr {
  url: string;
  expiresAt: number;
}

type SessionAction = 'qr' | 'reconnect' | 'disconnect' | null;

const stateLabels: Record<string, string> = {
  starting: 'Menyiapkan',
  connecting: 'Menghubungkan',
  qr_required: 'Menunggu QR',
  connected: 'Terhubung',
  reconnecting: 'Menghubungkan ulang',
  paused: 'Dijeda',
  logged_out: 'Keluar',
  bad_session: 'Sesi bermasalah',
  disconnected: 'Terputus',
  shutting_down: 'Menutup layanan'
};

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export default function SessionPage() {
  const [state, setState] = useState<SessionState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [qr, setQr] = useState<ActiveQr | null>(null);
  const [activeAction, setActiveAction] = useState<SessionAction>(null);
  const qrUrlRef = useRef<string | null>(null);
  const sessionStateRef = useRef<string | null>(null);

  const replaceQr = useCallback((next: ActiveQr | null) => {
    if (qrUrlRef.current) URL.revokeObjectURL(qrUrlRef.current);
    qrUrlRef.current = next?.url ?? null;
    setQr(next);
  }, []);

  const load = useCallback(async () => {
    try {
      const { data } = await api<SessionState>('/session');
      sessionStateRef.current = data.state;
      setState(data);
      if (data.state !== 'qr_required') replaceQr(null);
      return data;
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Status sesi gagal dimuat.');
      return null;
    }
  }, [replaceQr]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(interval);
  }, [load]);

  useEffect(
    () => () => {
      if (qrUrlRef.current) URL.revokeObjectURL(qrUrlRef.current);
    },
    []
  );

  useEffect(() => {
    if (!qr) return;
    const timeout = window.setTimeout(
      () => {
        replaceQr(null);
        setNotice('QR kedaluwarsa. Menunggu QR baru dari adapter WhatsApp.');
      },
      Math.max(0, qr.expiresAt - Date.now())
    );
    return () => window.clearTimeout(timeout);
  }, [qr, replaceQr]);

  const fetchQr = useCallback(async (): Promise<boolean> => {
    const response = await fetch('/api/admin/v1/session/qr', {
      credentials: 'same-origin',
      cache: 'no-store'
    });
    if (!response.ok) return false;
    const expiresAtHeader = response.headers.get('x-qr-expires-at');
    const parsedExpiresAt = expiresAtHeader ? Date.parse(expiresAtHeader) : Number.NaN;
    const expiresAt = Number.isFinite(parsedExpiresAt) ? parsedExpiresAt : Date.now() + 60_000;
    if (expiresAt <= Date.now()) return false;
    const blob = await response.blob();
    if (sessionStateRef.current !== 'qr_required') return false;
    replaceQr({ url: URL.createObjectURL(blob), expiresAt });
    return true;
  }, [replaceQr]);

  useEffect(() => {
    if (state?.state !== 'qr_required' || qr || activeAction !== null) return;
    let cancelled = false;
    let retry: number | undefined;
    const poll = async () => {
      try {
        if (await fetchQr()) {
          if (!cancelled) setNotice('QR aktif sementara. Pindai melalui menu Perangkat tertaut.');
          return;
        }
      } catch {
        // The next retry may succeed after a transient adapter or network failure.
      }
      if (!cancelled) retry = window.setTimeout(() => void poll(), 1_000);
    };
    void poll();
    return () => {
      cancelled = true;
      if (retry !== undefined) window.clearTimeout(retry);
    };
  }, [activeAction, fetchQr, qr, state?.state]);

  const loadQr = async () => {
    if (!state) return;
    setActiveAction('qr');
    setNotice(null);
    try {
      if (state.state === 'connected') {
        setNotice('Sesi sudah terhubung. Putuskan koneksi dahulu untuk membuat QR baru.');
        return;
      }
      if (['disconnected', 'logged_out', 'bad_session'].includes(state.state)) {
        await api('/session/reconnect', {
          method: 'POST',
          body: JSON.stringify({ expectedRevision: state.revision })
        });
        await load();
      }
      for (let attempt = 0; attempt < 15; attempt += 1) {
        if (await fetchQr()) {
          setNotice('QR aktif maksimal 60 detik. Pindai melalui menu Perangkat tertaut.');
          await load();
          return;
        }
        await wait(1_000);
      }
      setNotice('QR belum tersedia. Coba putuskan koneksi lalu tampilkan QR kembali.');
      await load();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'QR belum dapat ditampilkan.');
    } finally {
      setActiveAction(null);
    }
  };

  const reconnect = async () => {
    if (!state) return;
    setActiveAction('reconnect');
    setNotice(null);
    replaceQr(null);
    try {
      await api('/session/reconnect', {
        method: 'POST',
        body: JSON.stringify({ expectedRevision: state.revision })
      });
      setNotice('Adapter sedang menghubungkan ulang WhatsApp.');
      await load();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Reconnect gagal.');
    } finally {
      setActiveAction(null);
    }
  };

  const disconnect = async () => {
    if (!state) return;
    if (
      !window.confirm(
        'Putuskan WhatsApp dari aplikasi ini? QR baru diperlukan untuk terhubung lagi.'
      )
    ) {
      return;
    }
    setActiveAction('disconnect');
    setNotice(null);
    try {
      await api('/session/disconnect', {
        method: 'POST',
        body: JSON.stringify({
          expectedRevision: state.revision,
          confirmation: 'PUTUS KONEKSI'
        })
      });
      replaceQr(null);
      setNotice('Koneksi WhatsApp berhasil diputus.');
      await load();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Koneksi gagal diputus.');
    } finally {
      setActiveAction(null);
    }
  };

  const busy = activeAction !== null;

  return (
    <Shell eyebrow="Integrasi" title="Sesi WhatsApp">
      <section className="split-grid session-grid">
        <article className="section-card session-card">
          <p className="eyebrow">Adapter {state?.adapter ?? '—'}</p>
          <div className="session-state">
            <span
              className={`status-dot ${state?.state === 'connected' ? 'healthy' : 'warning'}`}
            />
            <div>
              <h2>{state ? (stateLabels[state.state] ?? state.state) : 'Memuat…'}</h2>
              <p>Status koneksi WhatsApp yang sedang digunakan aplikasi.</p>
            </div>
          </div>
          <dl>
            <div>
              <dt>Pembaruan state terakhir</dt>
              <dd>
                {state?.lastHeartbeatAt
                  ? new Date(state.lastHeartbeatAt).toLocaleString('id-ID')
                  : 'Belum tersedia'}
              </dd>
            </div>
            <div>
              <dt>Terhubung sejak</dt>
              <dd>
                {state?.state === 'connected' && state.connectedAt
                  ? new Date(state.connectedAt).toLocaleString('id-ID')
                  : 'Belum terhubung'}
              </dd>
            </div>
          </dl>
          <div className="qr-panel">
            <div className={`qr-display ${qr ? 'has-qr' : ''}`}>
              {qr ? (
                <img src={qr.url} alt="QR untuk menautkan perangkat WhatsApp" />
              ) : (
                <div>
                  <strong>QR belum ditampilkan</strong>
                  <span>QR hanya aktif sementara dan tidak disimpan aplikasi.</span>
                </div>
              )}
            </div>
            <button
              className="secondary-button"
              type="button"
              disabled={busy || !state}
              onClick={() => void loadQr()}
            >
              {activeAction === 'qr' ? 'Menunggu QR…' : 'Tampilkan QR'}
            </button>
          </div>
        </article>

        <article className="section-card session-controls">
          <p className="eyebrow">Kontrol sesi</p>
          <h2>Kelola koneksi WhatsApp</h2>
          <p>Semua aksi tercatat otomatis di audit log. Tidak perlu mengisi alasan.</p>
          {notice ? (
            <div className="notice" role="status">
              {notice}
            </div>
          ) : null}
          <div className="session-action-list">
            <div>
              <div>
                <strong>Hubungkan ulang</strong>
                <span>Mulai ulang koneksi tanpa menghapus perangkat tertaut.</span>
              </div>
              <button
                className="secondary-button"
                type="button"
                disabled={busy || !state}
                onClick={() => void reconnect()}
              >
                {activeAction === 'reconnect' ? 'Menghubungkan…' : 'Hubungkan ulang'}
              </button>
            </div>
            <div className="disconnect-action">
              <div>
                <strong>Putus koneksi</strong>
                <span>Keluar dan hapus sesi tertaut dari aplikasi ini.</span>
              </div>
              <button
                className="danger-button"
                type="button"
                disabled={busy || !state || state.state === 'disconnected'}
                onClick={() => void disconnect()}
              >
                {activeAction === 'disconnect' ? 'Memutus…' : 'Putus koneksi'}
              </button>
            </div>
          </div>
        </article>
      </section>
    </Shell>
  );
}
