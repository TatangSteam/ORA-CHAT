'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Shell } from '../../components/shell';
import { SectionHelp } from '../../components/section-help';
import { useSession } from '../../components/use-session';
import { api } from '../../lib/api';

interface RuleConfig {
  id: string;
  version: number;
  status: string;
  revision: number;
  rules: unknown[];
}
interface Integration {
  activeChatConnectionId: string | null;
  activeEmbeddingConnectionId: string | null;
  generationEnabled: boolean;
  retrievalEnabled: boolean;
  status: string;
}
interface Connection {
  id: string;
  name: string;
  purpose: 'chat' | 'embedding';
  provider: string;
  modelId: string;
  healthState: string;
  lastTestedAt: string | null;
}
interface KnowledgeItem {
  id: string;
  status: string;
}

const formatStatus = (value: string) => value.replaceAll('_', ' ');
const dateLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value)
      )
    : 'Belum pernah diuji';

export default function AgentsPage() {
  const { user } = useSession();
  const [rules, setRules] = useState<RuleConfig | null>(null);
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const permissions = user?.permissions ?? [];
  const has = (permission: string) => permissions.includes(permission);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const tasks: Promise<void>[] = [];
      if (user.permissions.includes('chatbot.read'))
        tasks.push(api<RuleConfig | null>('/chatbot/config').then(({ data }) => setRules(data)));
      if (user.permissions.includes('ai.settings.manage'))
        tasks.push(
          Promise.all([
            api<Integration>('/ai/integration'),
            api<Connection[]>('/ai/provider-connections')
          ]).then(([integrationResult, connectionResult]) => {
            setIntegration(integrationResult.data);
            setConnections(connectionResult.data);
          })
        );
      if (user.permissions.includes('knowledge.read'))
        tasks.push(
          api<KnowledgeItem[]>('/ai/knowledge?limit=100').then(({ data }) => setKnowledge(data))
        );
      await Promise.all(tasks);
    } catch {
      setError('Ringkasan agent tidak dapat dimuat. Perbarui halaman untuk mencoba lagi.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeChat = useMemo(
    () => connections.find(({ id }) => id === integration?.activeChatConnectionId) ?? null,
    [connections, integration]
  );
  const activeEmbedding = useMemo(
    () => connections.find(({ id }) => id === integration?.activeEmbeddingConnectionId) ?? null,
    [connections, integration]
  );
  const publishedKnowledge = knowledge?.filter(({ status }) => status === 'published').length;
  const pendingLabel = loading ? 'Memuat…' : error ? 'Belum tersedia' : null;
  const readiness = loading
    ? 'Memuat status…'
    : error || !has('chatbot.read')
      ? 'Status belum tersedia'
      : !rules
        ? 'Belum dikonfigurasi'
        : rules.status === 'published' && activeChat && activeChat.healthState === 'ready'
          ? 'Siap beroperasi'
          : 'Perlu ditinjau';

  return (
    <Shell eyebrow="Pengaturan asisten" title="Manajemen agent">
      <section className="hero-row agent-hero">
        <div>
          <p className="eyebrow">Satu agent WhatsApp aktif</p>
          <h2>Asisten operasional tenant</h2>
          <SectionHelp topic="agents-summary" />
          <p>Ringkasan aturan, AI, keamanan, dan sumber jawaban yang digunakan.</p>
        </div>
        <span className={`state-badge ${readiness === 'Siap beroperasi' ? 'healthy' : ''}`}>
          {readiness}
        </span>
      </section>
      {error ? (
        <p className="error-summary" role="alert">
          {error}
        </p>
      ) : null}
      <section className="agent-summary-grid" aria-label="Status agent" aria-busy={loading}>
        <article className="agent-summary-card">
          <span>Aturan chatbot</span>
          <strong>
            {pendingLabel ??
              (rules
                ? `v${rules.version} · ${formatStatus(rules.status)}`
                : has('chatbot.read')
                  ? 'Belum tersedia'
                  : 'Tidak diizinkan')}
          </strong>
          <small>
            {pendingLabel
              ? 'Menunggu ringkasan aturan chatbot.'
              : rules
                ? `${rules.rules.length} rule · revisi ${rules.revision}`
                : 'Tambahkan aturan chatbot terlebih dahulu.'}
          </small>
          {has('chatbot.read') ? <Link href="/chatbot">Kelola aturan</Link> : null}
        </article>
        <article className="agent-summary-card">
          <span>AI chat</span>
          <strong>
            {pendingLabel ??
              (activeChat
                ? activeChat.name
                : integration
                  ? 'Belum aktif'
                  : has('ai.settings.manage')
                    ? 'Belum tersedia'
                    : 'Tidak diizinkan')}
          </strong>
          <small>
            {pendingLabel
              ? 'Menunggu status koneksi AI.'
              : activeChat
                ? `${activeChat.provider} · ${activeChat.modelId} · ${formatStatus(activeChat.healthState)}`
                : 'Provider chat harus aktif dan diuji.'}
          </small>
          {has('ai.settings.manage') ? <Link href="/ai-settings">Kelola provider</Link> : null}
        </article>
        <article className="agent-summary-card">
          <span>Knowledge</span>
          <strong>
            {pendingLabel ??
              (publishedKnowledge === undefined
                ? has('knowledge.read')
                  ? 'Memuat…'
                  : 'Tidak diizinkan'
                : `${publishedKnowledge} terbit`)}
          </strong>
          <small>
            {pendingLabel
              ? 'Menunggu status sumber jawaban.'
              : activeEmbedding
                ? `Embedding: ${activeEmbedding.name}`
                : integration
                  ? 'Retrieval belum aktif.'
                  : 'Akses knowledge diperlukan untuk detail.'}
          </small>
          {has('knowledge.read') ? <Link href="/knowledge">Kelola knowledge</Link> : null}
        </article>
        <article className="agent-summary-card">
          <span>Keamanan dan pengujian</span>
          <strong>Diatur terpisah</strong>
          <small>
            Aturan yang dipublikasikan berlaku bersamaan. Uji AI tidak mengirim WhatsApp.
          </small>
          <span className="agent-link-row">
            {has('safety.read') ? <Link href="/safety">Keamanan</Link> : null}
            {has('knowledge.read') ? <Link href="/ai-search">Uji AI</Link> : null}
          </span>
        </article>
      </section>
      <section className="section-card agent-runtime-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Konfigurasi saat ini</p>
            <h2>Komposisi agent aktif</h2>
            <SectionHelp topic="agents-runtime" />
          </div>
          <small>Hanya lihat</small>
        </div>
        <div className="agent-runtime-list">
          <article>
            <strong>1. Perilaku deterministik</strong>
            <span>
              {pendingLabel
                ? 'Status aturan belum tersedia.'
                : rules
                  ? `Rule v${rules.version} ${formatStatus(rules.status)} dipakai sesuai snapshot runtime.`
                  : 'Belum ada konfigurasi rule yang dapat dipakai.'}
            </span>
          </article>
          <article>
            <strong>2. Generasi AI</strong>
            <span>
              {pendingLabel
                ? 'Status koneksi AI belum tersedia.'
                : activeChat
                  ? `${activeChat.name} menggunakan ${activeChat.modelId}; terakhir diuji ${dateLabel(activeChat.lastTestedAt)}.`
                  : 'Koneksi chat aktif belum tersedia atau belum dapat dilihat.'}
            </span>
          </article>
          <article>
            <strong>3. Sumber jawaban</strong>
            <span>
              {pendingLabel
                ? 'Status sumber jawaban belum tersedia.'
                : publishedKnowledge === undefined
                  ? 'Status knowledge belum tersedia untuk role ini.'
                  : `${publishedKnowledge} item knowledge berstatus published; retrieval ${integration?.retrievalEnabled ? 'diaktifkan' : 'belum aktif'}.`}
            </span>
          </article>
          <article>
            <strong>4. Pengamanan</strong>
            <span>
              Safety gate dan handoff tetap diterapkan oleh runtime; halaman ini tidak dapat
              mengubah pengiriman atau kredensial.
            </span>
          </article>
        </div>
      </section>
    </Shell>
  );
}
