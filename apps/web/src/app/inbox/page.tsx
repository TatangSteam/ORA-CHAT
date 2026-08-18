'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { Shell } from '../../components/shell';
import { api, ApiError } from '../../lib/api';
import type { ConversationSummary, MessageSummary } from '../../lib/messaging';

export default function InboxPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [search, setSearch] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const selectedId = selected?.id;

  const loadConversations = useCallback(async () => {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const { data } = await api<ConversationSummary[]>(`/conversations${query}`);
    setConversations(data);
    setSelected((current) =>
      current ? (data.find(({ id }) => id === current.id) ?? data[0] ?? null) : (data[0] ?? null)
    );
    return data;
  }, [search]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data } = await api<{
      conversation: ConversationSummary;
      messages: MessageSummary[];
    }>(`/conversations/${conversationId}/messages`);
    setMessages(data.messages.toReversed());
  }, []);

  useEffect(() => {
    void loadConversations().catch(() => setError('Inbox tidak dapat dimuat.'));
  }, [loadConversations]);

  useEffect(() => {
    followLatestRef.current = true;
    if (selectedId) {
      void loadMessages(selectedId).catch(() => setError('Timeline tidak dapat dimuat.'));
    }
  }, [loadMessages, selectedId]);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline || !followLatestRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      timeline.scrollTop = timeline.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages]);

  useEffect(() => {
    const refresh = () => {
      void loadConversations().catch(() => undefined);
      if (selected?.id) void loadMessages(selected.id).catch(() => undefined);
    };
    const events = new EventSource('/api/admin/v1/events/stream');
    events.addEventListener('message.inbound', refresh);
    const pollingFallback = window.setInterval(refresh, 5_000);
    return () => {
      events.removeEventListener('message.inbound', refresh);
      events.close();
      window.clearInterval(pollingFallback);
    };
  }, [loadConversations, loadMessages, selected?.id]);

  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !reply.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api('/messages', {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ contactId: selected.contact.id, content: reply })
      });
      setReply('');
      await loadMessages(selected.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Balasan gagal dibuat.');
    } finally {
      setBusy(false);
    }
  };

  const toggleAutomation = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (selected.handlingMode === 'bot') {
        await api('/handoffs', {
          method: 'POST',
          body: JSON.stringify({
            conversationId: selected.id,
            reasonCode: 'manual_review',
            priority: 'normal'
          })
        });
        await loadConversations();
        setNotice('AI dinonaktifkan. Percakapan sekarang ditangani admin.');
      } else {
        let current = selected;
        let resolvedCount = 0;
        while (current.handlingMode === 'human' && current.activeHandoff && resolvedCount < 10) {
          await api(`/handoffs/${current.activeHandoff.id}/resolve`, {
            method: 'POST',
            body: JSON.stringify({
              resolutionNote: 'AI diaktifkan kembali melalui kontrol Inbox'
            })
          });
          resolvedCount += 1;
          const refreshed = await loadConversations();
          current = refreshed.find(({ id }) => id === selected.id) ?? current;
        }
        if (current.handlingMode !== 'bot') {
          throw new Error('AI belum dapat diaktifkan karena status handoff tidak konsisten.');
        }
        setNotice('AI diaktifkan kembali untuk percakapan ini.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Mode penanganan gagal diubah.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell eyebrow="Pesan" title="Inbox">
      <section className="inbox-layout">
        <aside
          aria-label="Daftar percakapan"
          className="section-card conversation-list"
          tabIndex={0}
        >
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">WhatsApp</p>
              <h2>Percakapan</h2>
            </div>
            <span className="count-badge">{conversations.length}</span>
          </div>
          <label>
            <span className="sr-only">Cari percakapan</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama atau nomor"
            />
          </label>
          <div className="list-stack">
            {conversations.map((conversation) => (
              <button
                className={selected?.id === conversation.id ? 'list-row selected' : 'list-row'}
                key={conversation.id}
                onClick={() => setSelected(conversation)}
              >
                <span className="avatar">
                  {(conversation.contact.displayName ?? 'K').slice(0, 1)}
                </span>
                <span>
                  <strong>
                    {conversation.contact.displayName ?? conversation.contact.maskedPhone}
                  </strong>
                  <small>{conversation.lastMessage?.content ?? 'Belum ada pesan'}</small>
                </span>
                <span
                  className={`conversation-mode-badge ${conversation.handlingMode === 'bot' ? 'is-bot' : 'is-human'}`}
                >
                  {conversation.handlingMode === 'bot' ? 'AI' : 'ADMIN'}
                </span>
                {conversation.unreadCount > 0 && (
                  <span className="count-badge">{conversation.unreadCount}</span>
                )}
              </button>
            ))}
            {conversations.length === 0 && <p className="empty-state">Belum ada percakapan.</p>}
          </div>
        </aside>

        <section className="section-card timeline-panel" aria-live="polite">
          {selected ? (
            <>
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">{selected.contact.maskedPhone}</p>
                  <h2>{selected.contact.displayName ?? 'Kontak WhatsApp'}</h2>
                </div>
                <div
                  className={`automation-control ${selected.handlingMode === 'bot' ? 'is-bot' : 'is-human'}`}
                >
                  <span className="automation-copy">
                    <strong>{selected.handlingMode === 'bot' ? 'AI Aktif' : 'Admin Aktif'}</strong>
                    <small>
                      {selected.handlingMode === 'bot'
                        ? 'Bot membalas otomatis'
                        : 'AI tidak membalas pesan'}
                    </small>
                  </span>
                  <button
                    aria-label={
                      selected.handlingMode === 'bot'
                        ? 'Nonaktifkan AI dan alihkan ke admin'
                        : 'Aktifkan AI untuk percakapan ini'
                    }
                    aria-pressed={selected.handlingMode === 'bot'}
                    className="automation-toggle"
                    disabled={busy}
                    onClick={() => void toggleAutomation()}
                    type="button"
                  >
                    <span aria-hidden="true" className="automation-toggle-knob" />
                  </button>
                </div>
              </div>
              {notice && (
                <p className="notice success-notice automation-notice" role="status">
                  {notice}
                </p>
              )}
              {error && (
                <p className="error-summary automation-notice" role="alert">
                  {error}
                </p>
              )}
              <div
                aria-label="Timeline pesan"
                className="timeline"
                onScroll={(event) => {
                  const timeline = event.currentTarget;
                  followLatestRef.current =
                    timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 80;
                }}
                ref={timelineRef}
                tabIndex={0}
              >
                {messages.map((message) => (
                  <article
                    className={`message-bubble ${message.direction === 'outgoing' ? 'outgoing' : 'incoming'}`}
                    key={message.id}
                  >
                    <p>{message.content}</p>
                    <small>
                      {message.source} · {message.status} ·{' '}
                      {new Date(message.occurredAt).toLocaleTimeString('id-ID')}
                    </small>
                  </article>
                ))}
                {messages.length === 0 && <p className="empty-state">Timeline masih kosong.</p>}
              </div>
              <form className="reply-form" onSubmit={(event) => void sendReply(event)}>
                <label>
                  Balasan manual
                  <textarea
                    maxLength={4096}
                    required
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder="Tulis pesan untuk kontak ini…"
                  />
                </label>
                <button className="primary-button" disabled={busy} type="submit">
                  {busy ? 'Memproses…' : 'Kirim lewat outbox'}
                </button>
              </form>
            </>
          ) : (
            <p className="empty-state">Pilih percakapan untuk melihat timeline.</p>
          )}
        </section>
      </section>
    </Shell>
  );
}
