'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { Shell } from '../../components/shell';
import { SectionHelp, FieldHelp } from '../../components/section-help';
import { api, ApiError } from '../../lib/api';

interface Category {
  id: string;
  name: string;
  slug: string;
}
interface Item {
  id: string;
  title: string;
  status: string;
  revision: number;
  category: Category | null;
  currentVersion: {
    version: number;
    answer: string;
    questionVariants: Array<{ question: string }>;
  };
}

export default function KnowledgePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState('');
  const [answer, setAnswer] = useState('');
  const [questions, setQuestions] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    const [categoryResponse, itemResponse] = await Promise.all([
      api<Category[]>('/ai/knowledge/categories'),
      api<Item[]>('/ai/knowledge?limit=100')
    ]);
    setCategories(categoryResponse.data);
    setItems(itemResponse.data);
  }, []);

  useEffect(() => {
    void load().catch(() => setNotice('Knowledge tidak dapat dimuat.'));
  }, [load]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    try {
      await api('/ai/knowledge', {
        method: 'POST',
        body: JSON.stringify({
          title,
          answer,
          categoryId: categoryId || null,
          questionVariants: questions
            .split('\n')
            .map((value) => value.trim())
            .filter(Boolean),
          reason: 'Membuat draft knowledge operasional baru'
        })
      });
      setTitle('');
      setAnswer('');
      setQuestions('');
      setNotice('Draft knowledge dibuat.');
      await load();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Draft gagal dibuat.');
    }
  };

  const transition = async (item: Item, target: string) => {
    try {
      await api(`/ai/knowledge/${item.id}/lifecycle`, {
        method: 'POST',
        body: JSON.stringify({
          target,
          expectedRevision: item.revision,
          reason: `Transisi knowledge ke ${target} setelah peninjauan`
        })
      });
      await load();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Transisi gagal.');
    }
  };

  const next: Record<string, string | undefined> = {
    draft: 'in_review',
    in_review: 'approved',
    approved: 'published',
    published: 'archived'
  };

  const toggleExpanded = (itemId: string) => {
    setExpandedItems((current) => {
      const updated = new Set(current);
      if (updated.has(itemId)) updated.delete(itemId);
      else updated.add(itemId);
      return updated;
    });
  };

  return (
    <Shell eyebrow="Sumber jawaban AI" title="Knowledge">
      <div className="split-grid">
        <section className="section-card">
          <p className="eyebrow">Informasi resmi</p>
          <h2>Daftar informasi dan status publikasi</h2>
          <SectionHelp topic="knowledge-list" />
          <div className="stack-list">
            {items.map((item) => (
              <article className="list-row knowledge-list-row" key={item.id}>
                <div className="knowledge-list-copy">
                  <strong>{item.title}</strong>
                  <small>
                    v{item.currentVersion.version} · {item.category?.name ?? 'Tanpa kategori'}
                  </small>
                  <p id={`knowledge-answer-${item.id}`}>
                    {expandedItems.has(item.id)
                      ? item.currentVersion.answer
                      : `${item.currentVersion.answer.slice(0, 180).trimEnd()}${item.currentVersion.answer.length > 180 ? '…' : ''}`}
                  </p>
                  {item.currentVersion.answer.length > 180 ? (
                    <button
                      aria-controls={`knowledge-answer-${item.id}`}
                      aria-expanded={expandedItems.has(item.id)}
                      className="knowledge-expand-button"
                      type="button"
                      onClick={() => toggleExpanded(item.id)}
                    >
                      {expandedItems.has(item.id) ? 'Sembunyikan' : 'Lihat selengkapnya'}
                    </button>
                  ) : null}
                </div>
                <div className="action-row knowledge-list-actions">
                  <span className="state-badge">{item.status.replaceAll('_', ' ')}</span>
                  {next[item.status] ? (
                    <button
                      className="secondary-button"
                      onClick={() => void transition(item, next[item.status]!)}
                    >
                      {next[item.status]!.replaceAll('_', ' ')}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
            {items.length === 0 ? <p>Belum ada knowledge item.</p> : null}
          </div>
        </section>
        <section className="section-card">
          <p className="eyebrow">Rancangan informasi baru</p>
          <h2>Tambah knowledge</h2>
          <SectionHelp topic="knowledge-create" />
          <form onSubmit={(event) => void create(event)}>
            <label>
              Judul
              <input
                aria-label="Judul"
                aria-describedby="help-knowledge-1"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                minLength={3}
              />
              <FieldHelp id="help-knowledge-1">
                Nama topik yang jelas, misalnya Berapa jam layanan pelanggan?
              </FieldHelp>
            </label>
            <label>
              Kategori
              <select
                aria-label="Kategori"
                aria-describedby="help-knowledge-2"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">Tanpa kategori</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <FieldHelp id="help-knowledge-2">
                Kelompok topik agar mudah ditemukan. Pilih Tanpa kategori jika belum ditentukan.
              </FieldHelp>
            </label>
            <label>
              Jawaban terverifikasi
              <textarea
                aria-label="Jawaban terverifikasi"
                aria-describedby="help-knowledge-3"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                required
              />
              <FieldHelp id="help-knowledge-3">
                Isi informasi resmi yang sudah dipastikan benar, termasuk syarat dan batasannya.
                Jangan menebak harga, jadwal, atau manfaat.
              </FieldHelp>
            </label>
            <label>
              Varian pertanyaan (satu per baris)
              <textarea
                aria-label="Varian pertanyaan (satu per baris)"
                aria-describedby="help-knowledge-4"
                value={questions}
                onChange={(event) => setQuestions(event.target.value)}
              />
              <FieldHelp id="help-knowledge-4">
                Tulis beberapa cara menanyakan hal yang sama, satu per baris. Contoh: Buka jam
                berapa? lalu Jam kerja admin kapan?
              </FieldHelp>
            </label>
            <button className="primary-button" type="submit">
              Simpan draft
            </button>
          </form>
          {notice ? <p className="notice">{notice}</p> : null}
        </section>
      </div>
    </Shell>
  );
}
