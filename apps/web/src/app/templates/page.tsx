'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { Shell } from '../../components/shell';
import { api, ApiError } from '../../lib/api';

const variables = [
  'nama_pelanggan',
  'nomor_pelanggan',
  'nama_admin',
  'tanggal',
  'informasi_tambahan'
] as const;

type TemplateVersion = {
  id: string;
  version: number;
  status: 'draft' | 'published' | 'retired';
  body: string;
  variableSchema: string[];
  checklistItems: Array<{ id: string; sequence: number; label: string; required: boolean }>;
};

type MessageTemplate = {
  id: string;
  name: string;
  category: string;
  status: 'active' | 'inactive' | 'archived';
  currentVersion: number;
  versions: TemplateVersion[];
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('layanan');
  const [body, setBody] = useState('Halo {{nama_pelanggan}},');
  const [selectedVariables, setSelectedVariables] = useState<string[]>(['nama_pelanggan']);
  const [checklist, setChecklist] = useState('Nomor pelanggan sudah diverifikasi');
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api<MessageTemplate[]>('/templates?limit=50');
      setTemplates(response.data);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Template gagal dimuat.');
    }
  }, []);

  useEffect(() => void load(), [load]);

  const resetEditor = () => {
    setEditing(null);
    setName('');
    setCategory('layanan');
    setBody('Halo {{nama_pelanggan}},');
    setSelectedVariables(['nama_pelanggan']);
    setChecklist('Nomor pelanggan sudah diverifikasi');
  };

  const edit = (template: MessageTemplate) => {
    const current = template.versions.find(({ version }) => version === template.currentVersion);
    if (!current) return;
    setEditing(template);
    setName(template.name);
    setCategory(template.category);
    setBody(current.body);
    setSelectedVariables(current.variableSchema);
    setChecklist(current.checklistItems.map(({ label }) => label).join('\n'));
    setNotice(null);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const version = {
      body,
      variableSchema: selectedVariables,
      checklist: checklist
        .split('\n')
        .map((label) => label.trim())
        .filter(Boolean)
        .map((label, sequence) => ({ sequence, label, required: true }))
    };
    try {
      if (editing) {
        await api(`/templates/${editing.id}/versions`, {
          method: 'POST',
          body: JSON.stringify({ expectedVersion: editing.currentVersion, version })
        });
        setNotice('Draft versi baru berhasil dibuat.');
      } else {
        await api('/templates', {
          method: 'POST',
          body: JSON.stringify({ name, category, version })
        });
        setNotice('Template draft berhasil dibuat.');
      }
      resetEditor();
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Template gagal disimpan.');
    } finally {
      setBusy(false);
    }
  };

  const mutate = async (path: string, payload: unknown, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: 'POST', body: JSON.stringify(payload) });
      setNotice(message);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Aksi template gagal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell eyebrow="Pesan" title="Template pesan">
      <div className="template-layout">
        <section className="section-card">
          <p className="eyebrow">Versioned internal template</p>
          <h2>{editing ? `Versi baru · ${editing.name}` : 'Template baru'}</h2>
          <p>
            Placeholder hanya memakai variable yang disetujui. Template ini bukan template Meta.
          </p>
          <form onSubmit={(event) => void submit(event)}>
            <div className="form-grid">
              <label>
                Nama
                <input
                  required
                  disabled={Boolean(editing)}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                Kategori
                <input
                  required
                  disabled={Boolean(editing)}
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                />
              </label>
            </div>
            <label>
              Isi template
              <textarea
                required
                maxLength={4096}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </label>
            <fieldset className="template-variable-grid">
              <legend>Variable schema</legend>
              {variables.map((variable) => (
                <label key={variable} className="check-row">
                  <input
                    type="checkbox"
                    checked={selectedVariables.includes(variable)}
                    onChange={(event) =>
                      setSelectedVariables((current) =>
                        event.target.checked
                          ? [...current, variable]
                          : current.filter((item) => item !== variable)
                      )
                    }
                  />
                  {variable}
                </label>
              ))}
            </fieldset>
            <label>
              Checklist wajib (satu item per baris)
              <textarea value={checklist} onChange={(event) => setChecklist(event.target.value)} />
            </label>
            {error && <p className="error-summary">{error}</p>}
            {notice && <p className="notice success-notice">{notice}</p>}
            <div className="action-row">
              <button className="primary-button" disabled={busy} type="submit">
                {busy ? 'Menyimpan…' : editing ? 'Buat draft versi' : 'Buat template'}
              </button>
              {editing && (
                <button type="button" onClick={resetEditor}>
                  Batal
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="section-card">
          <p className="eyebrow">Lifecycle dan histori</p>
          <h2>Daftar template</h2>
          <div
            className="stack-list phase6-template-list"
            role="region"
            tabIndex={0}
            aria-label="Daftar template pesan"
          >
            {templates.length === 0 && <p className="empty-state">Belum ada template.</p>}
            {templates.map((template) => {
              const current = template.versions.find(
                ({ version }) => version === template.currentVersion
              );
              return (
                <article className="list-card" key={template.id}>
                  <div className="card-heading-row">
                    <div>
                      <strong>{template.name}</strong>
                      <small>
                        {template.category} · v{template.currentVersion}
                      </small>
                    </div>
                    <span
                      className={`status-badge ${template.status === 'active' ? 'healthy' : ''}`}
                    >
                      {template.status}
                    </span>
                  </div>
                  <p>{current?.body ?? 'Versi tidak tersedia.'}</p>
                  <small>
                    Histori:{' '}
                    {template.versions
                      .map(({ version, status }) => `v${version} ${status}`)
                      .join(' · ')}
                  </small>
                  <div className="action-row compact-actions">
                    <button
                      disabled={busy || template.status === 'archived'}
                      onClick={() => edit(template)}
                    >
                      Edit versi
                    </button>
                    {current?.status === 'draft' && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            `/templates/${template.id}/publish`,
                            {
                              expectedVersion: template.currentVersion,
                              reason: 'Publikasi versi template oleh admin'
                            },
                            'Versi berhasil dipublikasikan.'
                          )
                        }
                      >
                        Publish
                      </button>
                    )}
                    {current?.status === 'published' && template.status !== 'archived' && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            `/templates/${template.id}/lifecycle`,
                            {
                              expectedVersion: template.currentVersion,
                              status: template.status === 'active' ? 'inactive' : 'active',
                              reason: 'Perubahan lifecycle template oleh admin'
                            },
                            'Lifecycle template diperbarui.'
                          )
                        }
                      >
                        {template.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    )}
                    <button
                      disabled={busy}
                      onClick={() =>
                        void mutate(
                          `/templates/${template.id}/duplicate`,
                          { name: `${template.name} Salinan` },
                          'Template berhasil diduplikasi.'
                        )
                      }
                    >
                      Duplikat
                    </button>
                    <button
                      disabled={busy || template.status === 'archived'}
                      onClick={() =>
                        void mutate(
                          `/templates/${template.id}/lifecycle`,
                          {
                            expectedVersion: template.currentVersion,
                            status: 'archived',
                            reason: 'Arsip template oleh admin'
                          },
                          'Template diarsipkan.'
                        )
                      }
                    >
                      Arsipkan
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </Shell>
  );
}
