'use client';

import { useCallback, useEffect, useState } from 'react';

import { Shell } from '../../components/shell';
import { api, ApiError } from '../../lib/api';

interface Feedback {
  id: string;
  rating: string;
  category: string;
}
interface Trace {
  id: string;
  status: string;
  answer: string;
  fallbackReason: string | null;
  latencyMs: number;
  createdAt: string;
  feedback: Feedback[];
}
interface Unanswered {
  id: string;
  representativeQuestion: string;
  occurrenceCount: number;
  status: string;
  lastSeenAt: string;
}

export default function AiOperationsPage() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [unanswered, setUnanswered] = useState<Unanswered[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftAnswer, setDraftAnswer] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [traceResponse, unansweredResponse] = await Promise.all([
      api<Trace[]>('/ai/traces'),
      api<Unanswered[]>('/ai/unanswered?status=open&limit=50')
    ]);
    setTraces(traceResponse.data);
    setUnanswered(unansweredResponse.data);
  }, []);
  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  const review = async (traceId: string, rating: string, category: string) => {
    try {
      await api(`/ai/traces/${traceId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({
          rating,
          category,
          note: null,
          reason: 'Review kualitas jawaban oleh admin operasional'
        })
      });
      setNotice('Feedback disimpan dan perubahan tercatat pada audit append-only.');
      await load();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Feedback gagal disimpan.');
    }
  };

  const createDraft = async (question: Unanswered) => {
    if (!draftAnswer.trim()) return;
    try {
      await api(`/ai/unanswered/${question.id}/draft`, {
        method: 'POST',
        body: JSON.stringify({
          title: `Jawaban: ${question.representativeQuestion}`.slice(0, 240),
          answer: draftAnswer,
          categoryId: null,
          reason: 'Mengubah pertanyaan belum terjawab menjadi draft knowledge'
        })
      });
      setDraftAnswer('');
      setDraftId(null);
      setNotice('Draft knowledge dibuat untuk ditinjau dan dipublikasikan melalui lifecycle.');
      await load();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Draft gagal dibuat.');
    }
  };

  return (
    <Shell eyebrow="Quality operations" title="Review & unanswered">
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      <section className="section-card">
        <p className="eyebrow">Conversation review</p>
        <h2>Jawaban AI terbaru</h2>
        <div className="stack-list">
          {traces.map((trace) => (
            <article className="list-row operations-row" key={trace.id}>
              <div className="operations-copy">
                <strong>{trace.status}</strong>
                <p>{trace.answer}</p>
                <small>
                  {trace.latencyMs} ms · {trace.fallbackReason ?? 'grounded'}
                </small>
              </div>
              <div aria-label="Aksi review jawaban" className="action-row operations-actions">
                <button
                  className="secondary-button"
                  onClick={() => void review(trace.id, 'correct', 'correct')}
                >
                  Benar
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void review(trace.id, 'incorrect', 'wrong_source')}
                >
                  Sumber salah
                </button>
                <button
                  className="danger-button"
                  onClick={() => void review(trace.id, 'unsafe', 'unsafe')}
                >
                  Tidak aman
                </button>
                {trace.feedback[0] ? (
                  <span className="state-badge">{trace.feedback[0].category}</span>
                ) : null}
              </div>
            </article>
          ))}
          {traces.length === 0 ? <p className="muted">Belum ada trace untuk direview.</p> : null}
        </div>
      </section>
      <section className="section-card">
        <p className="eyebrow">Aggregated safely</p>
        <h2>Pertanyaan belum terjawab</h2>
        <div className="stack-list">
          {unanswered.map((question) => (
            <article className="list-row operations-row" key={question.id}>
              <div className="operations-copy">
                <strong>{question.representativeQuestion}</strong>
                <p>
                  {question.occurrenceCount} occurrence · terakhir{' '}
                  {new Date(question.lastSeenAt).toLocaleString('id-ID')}
                </p>
                {draftId === question.id ? (
                  <label>
                    Jawaban draft
                    <textarea
                      value={draftAnswer}
                      onChange={(event) => setDraftAnswer(event.target.value)}
                    />
                  </label>
                ) : null}
              </div>
              <div className="action-row operations-actions unanswered-actions">
                {draftId === question.id ? (
                  <button
                    className="primary-button"
                    disabled={!draftAnswer.trim()}
                    onClick={() => void createDraft(question)}
                  >
                    Simpan draft
                  </button>
                ) : (
                  <button className="secondary-button" onClick={() => setDraftId(question.id)}>
                    Jadikan knowledge
                  </button>
                )}
              </div>
            </article>
          ))}
          {unanswered.length === 0 ? <p className="muted">Tidak ada pertanyaan terbuka.</p> : null}
        </div>
      </section>
    </Shell>
  );
}
