'use client';

import { useCallback, useEffect, useState } from 'react';

import { Shell } from '../../components/shell';
import { useSession } from '../../components/use-session';
import { api, ApiError } from '../../lib/api';
import type { HandoffSummary } from '../../lib/messaging';

export default function HandoffsPage() {
  const { user } = useSession();
  const [items, setItems] = useState<HandoffSummary[]>([]);
  const [note, setNote] = useState('Percakapan telah ditangani oleh admin');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await api<HandoffSummary[]>('/handoffs');
    setItems(data);
  }, []);

  useEffect(() => {
    void load().catch(() => setError('Handoff tidak dapat dimuat.'));
  }, [load]);

  const assign = async (id: string) => {
    if (!user) return;
    try {
      await api(`/handoffs/${id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ assigneeUserId: user.id, reason: 'Diambil oleh admin aktif' })
      });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Assignment gagal.');
    }
  };

  const resolve = async (id: string) => {
    try {
      await api(`/handoffs/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolutionNote: note })
      });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Resolve gagal.');
    }
  };

  return (
    <Shell eyebrow="Operasional" title="Handoff admin">
      <section className="section-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Human ownership</p>
            <h2>Antrean bantuan</h2>
          </div>
          <span className="count-badge">
            {items.filter(({ status }) => status !== 'resolved').length}
          </span>
        </div>
        <label>
          Catatan penyelesaian
          <input minLength={8} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        {error && <p className="error-summary">{error}</p>}
        <div aria-label="Daftar handoff" className="data-list bounded-data-list" tabIndex={0}>
          {items.map((item) => (
            <article className="outbox-row" key={item.id}>
              <div>
                <span className={`state-badge ${item.priority === 'urgent' ? 'danger' : ''}`}>
                  {item.priority} · {item.status}
                </span>
                <h3>
                  {item.conversation.contact.displayName ?? item.conversation.contact.maskedPhone}
                </h3>
                <p>{item.reasonCode.replaceAll('_', ' ')}</p>
                <small>{item.assigneeUser?.displayName ?? 'Belum ditugaskan'}</small>
              </div>
              {['open', 'assigned'].includes(item.status) && (
                <div className="action-row">
                  <button className="secondary-button" onClick={() => void assign(item.id)}>
                    Ambil
                  </button>
                  <button className="primary-button" onClick={() => void resolve(item.id)}>
                    Selesaikan
                  </button>
                </div>
              )}
            </article>
          ))}
          {items.length === 0 && <p className="empty-state">Tidak ada handoff.</p>}
        </div>
      </section>
    </Shell>
  );
}
