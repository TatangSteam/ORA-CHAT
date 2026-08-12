'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { Shell } from '../../components/shell';
import { api, ApiError } from '../../lib/api';

interface RuleConfig {
  id: string;
  version: number;
  status: string;
  revision: number;
  greeting: string | null;
  fallback: string;
  rules: Array<{
    sequence: number;
    name: string;
    triggerType: 'exact' | 'contains' | 'starts_with' | 'fallback';
    triggerConfig: { value?: string };
    responseConfig: { text?: string };
    enabled: boolean;
  }>;
}

export default function ChatbotPage() {
  const [config, setConfig] = useState<RuleConfig | null>(null);
  const [fallback, setFallback] = useState('Mohon tunggu, admin kami akan membantu Anda.');
  const [trigger, setTrigger] = useState('menu');
  const [response, setResponse] = useState('Silakan pilih layanan yang Anda perlukan.');
  const [testInput, setTestInput] = useState('menu');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await api<RuleConfig | null>('/chatbot/config');
    setConfig(data);
    if (data) {
      setFallback(data.fallback);
      setTrigger(data.rules[0]?.triggerConfig.value ?? 'menu');
      setResponse(data.rules[0]?.responseConfig.text ?? 'Silakan pilih layanan.');
    }
  }, []);

  useEffect(() => {
    void load().catch(() => setError('Konfigurasi chatbot tidak dapat dimuat.'));
  }, [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const { data } = await api<RuleConfig>('/chatbot/config', {
        method: 'POST',
        body: JSON.stringify({
          expectedRevision: config?.status === 'draft' ? config.revision : 0,
          fallback,
          rules: [
            {
              sequence: 10,
              name: 'Menu utama',
              triggerType: 'exact',
              trigger,
              response,
              enabled: true
            }
          ]
        })
      });
      setConfig(data);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Draft gagal disimpan.');
    }
  };

  const publish = async () => {
    if (!config || config.status !== 'draft') return;
    try {
      const { data } = await api<RuleConfig>(`/chatbot/config/${config.id}/publish`, {
        method: 'POST',
        body: JSON.stringify({
          expectedRevision: config.revision,
          reason: 'Publikasi rule operasional yang telah ditinjau'
        })
      });
      setConfig(data);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Publish gagal.');
    }
  };

  const test = async () => {
    try {
      const { data } = await api<{ matched: boolean; response: string }>('/chatbot/test', {
        method: 'POST',
        body: JSON.stringify({ input: testInput, versionId: config?.id })
      });
      setTestResult(`${data.matched ? 'Rule cocok' : 'Fallback'}: ${data.response}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Test rule gagal.');
    }
  };

  return (
    <Shell eyebrow="Otomasi" title="Chatbot">
      <div className="split-grid">
        <section className="section-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Ordered rules</p>
              <h2>Konfigurasi deterministic</h2>
            </div>
            <span className="state-badge">
              {config ? `v${config.version} · ${config.status}` : 'baru'}
            </span>
          </div>
          <form onSubmit={(event) => void save(event)}>
            <label>
              Trigger persis
              <input
                required
                value={trigger}
                onChange={(event) => setTrigger(event.target.value)}
              />
            </label>
            <label>
              Respons
              <textarea
                required
                value={response}
                onChange={(event) => setResponse(event.target.value)}
              />
            </label>
            <label>
              Fallback aman
              <textarea
                required
                value={fallback}
                onChange={(event) => setFallback(event.target.value)}
              />
            </label>
            {error && <p className="error-summary">{error}</p>}
            <div className="action-row">
              <button className="secondary-button" type="submit">
                Simpan draft
              </button>
              <button
                className="primary-button"
                disabled={config?.status !== 'draft'}
                type="button"
                onClick={() => void publish()}
              >
                Publish atomic
              </button>
            </div>
          </form>
        </section>
        <section className="section-card">
          <p className="eyebrow">Test console</p>
          <h2>Uji routing tanpa mengirim WhatsApp</h2>
          <p>Playground ini hanya mengevaluasi rule dan tidak membuat penerima atau outbox.</p>
          <label>
            Pesan uji
            <textarea value={testInput} onChange={(event) => setTestInput(event.target.value)} />
          </label>
          <button className="secondary-button" onClick={() => void test()}>
            Jalankan test
          </button>
          {testResult && <p className="notice success-notice">{testResult}</p>}
        </section>
      </div>
    </Shell>
  );
}
