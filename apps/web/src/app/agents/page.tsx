'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Shell } from '../../components/shell';
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
  const permissions = user?.permissions ?? [];
  const has = (permission: string) => permissions.includes(permission);

  const load = useCallback(async () => {
    setError(null);
    try {
      const tasks: Promise<void>[] = [
        api<RuleConfig | null>('/chatbot/config').then(({ data }) => setRules(data))
      ];
      if (has('ai.settings.manage'))
        tasks.push(
          Promise.all([
            api<Integration>('/ai/integration'),
            api<Connection[]>('/ai/provider-connections')
          ]).then(([integrationResult, connectionResult]) => {
            setIntegration(integrationResult.data);
            setConnections(connectionResult.data);
          })
        );
      if (has('knowledge.read'))
        tasks.push(
          api<KnowledgeItem[]>('/ai/knowledge?limit=100').then(({ data }) => setKnowledge(data))
        );
      await Promise.all(tasks);
    } catch {
      setError('Ringkasan agent tidak dapat dimuat. Perbarui halaman untuk mencoba lagi.');
    }
  }, [permissions]);

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
  const readiness = !rules
    ? 'Belum dikonfigurasi'
    : rules.status === 'published' && activeChat && activeChat.healthState === 'ready'
      ? 'Siap beroperasi'
      : 'Perlu ditinjau';

  return (
    <Shell eyebrow="Agent control" title="Agent Management">
      <section className="hero-row agent-hero">
        <div>
          <p className="eyebrow">Satu agent WhatsApp aktif</p>
          <h2>Asisten operasional tenant</h2>
          <p>Ringkasan rule, AI, safety, dan knowledge dari konfigurasi yang telah ada.</p>
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
      <section className="agent-summary-grid" aria-label="Status agent">
        <article className="agent-summary-card">
          <span>Rule runtime</span>
          <strong>
            {rules ? `v${rules.version} · ${formatStatus(rules.status)}` : 'Belum tersedia'}
          </strong>
          <small>
            {rules
              ? `${rules.rules.length} rule · revisi ${rules.revision}`
              : 'Atur rule deterministic terlebih dahulu.'}
          </small>
          {has('chatbot.read') ? <Link href="/chatbot">Kelola rule →</Link> : null}
        </article>
        <article className="agent-summary-card">
          <span>AI chat</span>
          <strong>
            {activeChat ? activeChat.name : integration ? 'Belum aktif' : 'Tidak diizinkan'}
          </strong>
          <small>
            {activeChat
              ? `${activeChat.provider} · ${activeChat.modelId} · ${formatStatus(activeChat.healthState)}`
              : 'Provider chat harus aktif dan diuji.'}
          </small>
          {has('ai.settings.manage') ? <Link href="/ai-settings">Kelola provider →</Link> : null}
        </article>
        <article className="agent-summary-card">
          <span>Knowledge</span>
          <strong>
            {publishedKnowledge === undefined
              ? has('knowledge.read')
                ? 'Memuat…'
                : 'Tidak diizinkan'
              : `${publishedKnowledge} terbit`}
          </strong>
          <small>
            {activeEmbedding
              ? `Embedding: ${activeEmbedding.name}`
              : integration
                ? 'Retrieval belum aktif.'
                : 'Akses knowledge diperlukan untuk detail.'}
          </small>
          {has('knowledge.read') ? <Link href="/knowledge">Kelola knowledge →</Link> : null}
        </article>
        <article className="agent-summary-card">
          <span>Safety & pengujian</span>
          <strong>Diatur terpisah</strong>
          <small>Publish rule bersifat atomic. Playground tidak mengirim WhatsApp.</small>
          <span className="agent-link-row">
            {has('safety.read') ? <Link href="/safety">Keamanan →</Link> : null}
            {has('knowledge.read') ? <Link href="/ai-search">Uji AI →</Link> : null}
          </span>
        </article>
      </section>
      <section className="section-card agent-runtime-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Runtime snapshot</p>
            <h2>Komposisi agent aktif</h2>
          </div>
          <small>Read-only view</small>
        </div>
        <div className="agent-runtime-list">
          <article>
            <strong>1. Perilaku deterministik</strong>
            <span>
              {rules
                ? `Rule v${rules.version} ${formatStatus(rules.status)} dipakai sesuai snapshot runtime.`
                : 'Belum ada konfigurasi rule yang dapat dipakai.'}
            </span>
          </article>
          <article>
            <strong>2. Generasi AI</strong>
            <span>
              {activeChat
                ? `${activeChat.name} menggunakan ${activeChat.modelId}; terakhir diuji ${dateLabel(activeChat.lastTestedAt)}.`
                : 'Koneksi chat aktif belum tersedia atau belum dapat dilihat.'}
            </span>
          </article>
          <article>
            <strong>3. Grounding knowledge</strong>
            <span>
              {publishedKnowledge === undefined
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
