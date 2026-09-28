'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Shell } from '../../components/shell';
import { useSession } from '../../components/use-session';
import { api, ApiError } from '../../lib/api';
import type { ConversationSummary, MessageSummary } from '../../lib/messaging';

export default function InboxPage() {
  const { user } = useSession();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'unread' | 'handoff' | 'follow_up'>(
    'all'
  );
  const [modeFilter, setModeFilter] = useState<'all' | 'bot' | 'human'>('all');
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const selectedId = selected?.id;
  const canSend = user?.permissions.includes('messages.send') ?? false;
  const canManageHandoff = user?.permissions.includes('handoffs.manage') ?? false;

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
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (priorityFilter !== 'all') params.set('priority', priorityFilter);
    if (modeFilter !== 'all') params.set('mode', modeFilter);
    const query = params.toString();
    window.history.replaceState(null, '', query ? `/inbox?${query}` : '/inbox');
  }, [modeFilter, priorityFilter, search]);

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

  const visibleConversations = useMemo(
    () =>
      conversations.filter((conversation) => {
        if (modeFilter !== 'all' && conversation.handlingMode !== modeFilter) return false;
        if (priorityFilter === 'unread') return conversation.unreadCount > 0;
        if (priorityFilter === 'handoff') return Boolean(conversation.activeHandoff);
        if (priorityFilter === 'follow_up') return conversation.followUpRequired;
        return true;
      }),
    [conversations, modeFilter, priorityFilter]
  );

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
          <div className="inbox-filters" aria-label="Filter percakapan">
            <label>
              <span className="sr-only">Prioritas</span>
              <select
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value as typeof priorityFilter)}
              >
                <option value="all">Semua prioritas</option>
                <option value="unread">Belum dibaca</option>
                <option value="handoff">Handoff aktif</option>
                <option value="follow_up">Perlu follow-up</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Mode penanganan</span>
              <select
                value={modeFilter}
                onChange={(event) => setModeFilter(event.target.value as typeof modeFilter)}
              >
                <option value="all">AI & admin</option>
                <option value="bot">AI aktif</option>
                <option value="human">Admin aktif</option>
              </select>
            </label>
          </div>
          <div className="list-stack">
            {visibleConversations.map((conversation) => (
              <button
                className={selected?.id === conversation.id ? 'list-row selected' : 'list-row'}
                key={conversation.id}
                aria-pressed={selected?.id === conversation.id}
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
                {conversation.activeHandoff ? (
                  <span className="inbox-priority-tag">handoff</span>
                ) : null}
                {conversation.followUpRequired ? (
                  <span className="inbox-priority-tag">follow-up</span>
                ) : null}
              </button>
            ))}
            {visibleConversations.length === 0 && (
              <p className="empty-state">Tidak ada percakapan yang sesuai filter.</p>
            )}
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
                  {canManageHandoff ? (
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
                  ) : null}
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
                    {message.status === 'unknown' ? (
                      <Link className="message-status-link" href="/outbox">
                        Status unknown — rekonsiliasi di Outbox
                      </Link>
                    ) : null}
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
                  <small className="composer-meta">
                    {reply.length.toLocaleString('id-ID')} / 4.096 karakter · dikirim melalui
                    durable outbox
                  </small>
                </label>
                <button className="primary-button" disabled={busy || !canSend} type="submit">
                  {busy ? 'Memproses…' : 'Kirim lewat outbox'}
                </button>
                {!canSend ? (
                  <small className="composer-meta">
                    Anda tidak memiliki izin untuk mengirim pesan.
                  </small>
                ) : null}
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
