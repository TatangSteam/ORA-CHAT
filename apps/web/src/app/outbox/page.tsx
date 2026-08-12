'use client';

import { useCallback, useEffect, useState } from 'react';

import { Shell } from '../../components/shell';
import { api, ApiError } from '../../lib/api';
import type { OutboxSummary } from '../../lib/messaging';

export default function OutboxPage() {
  const [items, setItems] = useState<OutboxSummary[]>([]);
  const [reason, setReason] = useState('Tindak lanjut operasional oleh admin');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await api<OutboxSummary[]>('/outbox');
    setItems(data);
  }, []);

  useEffect(() => {
    void load().catch(() => setError('Riwayat outbox tidak dapat dimuat.'));
    const timer = setInterval(() => void load(), 5_000);
    return () => clearInterval(timer);
  }, [load]);

  const mutate = async (
    id: string,
    action: 'cancel' | 'retry' | 'reconcile',
    outcome?: 'sent' | 'failed'
  ) => {
    setBusyId(id);
    setError(null);
    try {
      await api(`/outbox/${id}/${action}`, {
        method: 'POST',
        body: JSON.stringify(outcome ? { reason, outcome } : { reason })
      });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Aksi outbox gagal.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Shell eyebrow="Pesan" title="Riwayat outbox">
      <section className="section-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Source of truth</p>
            <h2>Pengiriman durable</h2>
          </div>
          <span className="count-badge">{items.length}</span>
        </div>
        <label>
          Alasan aksi retry, cancel, atau reconcile
          <input minLength={8} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        {error && <p className="error-summary">{error}</p>}
        <div className="data-list">
          {items.map((item) => (
            <article className="outbox-row" key={item.id}>
              <div>
                <span className={`state-badge state-${item.status}`}>{item.status}</span>
                <h3>
                  {item.message.conversation.contact.displayName ??
                    item.message.conversation.contact.maskedPhone}
                </h3>
                <p>{item.message.content}</p>
                <small>
                  Percobaan {item.attemptCount}/{item.maxAttempts}
                  {item.lastErrorCode ? ` · ${item.lastErrorCode}` : ''}
                </small>
              </div>
              <div className="action-row">
                {['queued', 'retryable'].includes(item.status) && (
                  <button
                    className="danger-button"
                    disabled={busyId === item.id}
                    onClick={() => void mutate(item.id, 'cancel')}
                  >
                    Batalkan
                  </button>
                )}
                {['failed', 'retryable'].includes(item.status) && (
                  <button
                    className="secondary-button"
                    disabled={busyId === item.id}
                    onClick={() => void mutate(item.id, 'retry')}
                  >
                    Retry
                  </button>
                )}
                {item.status === 'unknown' && (
                  <>
                    <button
                      className="secondary-button"
                      disabled={busyId === item.id}
                      onClick={() => void mutate(item.id, 'reconcile', 'failed')}
                    >
                      Tandai gagal
                    </button>
                    <button
                      className="primary-button"
                      disabled={busyId === item.id}
                      onClick={() => void mutate(item.id, 'reconcile', 'sent')}
                    >
                      Tandai terkirim
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
          {items.length === 0 && <p className="empty-state">Outbox masih kosong.</p>}
        </div>
      </section>
    </Shell>
  );
}
