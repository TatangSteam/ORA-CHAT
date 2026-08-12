'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { Shell } from '../../components/shell';
import { api, ApiError } from '../../lib/api';

type TemplateVersion = {
  id: string;
  version: number;
  status: string;
  variableSchema: string[];
  checklistItems: Array<{ id: string; label: string; required: boolean; sequence: number }>;
};

type MessageTemplate = {
  id: string;
  name: string;
  status: string;
  versions: TemplateVersion[];
};

type Preview = {
  renderedBody: string;
  checklist: Array<{ id: string; label: string; required: boolean; checked: boolean }>;
};

const variableLabels: Record<string, string> = {
  nama_pelanggan: 'Nama pelanggan',
  nomor_pelanggan: 'Nomor pelanggan',
  nama_admin: 'Nama admin',
  tanggal: 'Tanggal',
  informasi_tambahan: 'Informasi tambahan'
};

export default function ComposePage() {
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templateVersionId, setTemplateVersionId] = useState('');
  const [resolvedVariables, setResolvedVariables] = useState<Record<string, string>>({});
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<MessageTemplate[]>('/templates?limit=100&status=active')
      .then((response) => setTemplates(response.data))
      .catch(() => setTemplates([]));
  }, []);

  const selectedVersion = useMemo(
    () =>
      templates
        .flatMap(({ versions }) => versions)
        .find(({ id, status }) => id === templateVersionId && status === 'published'),
    [templateVersionId, templates]
  );

  const chooseTemplate = (id: string) => {
    setTemplateVersionId(id);
    setResolvedVariables({});
    setCheckedItems({});
    setPreview(null);
    setContent('');
  };

  const renderPreview = async () => {
    if (!templateVersionId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api<Preview>('/templates/preview', {
        method: 'POST',
        body: JSON.stringify({ templateVersionId, variables: resolvedVariables })
      });
      setPreview(response.data);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Preview gagal dibuat.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const template = selectedVersion
        ? {
            templateVersionId: selectedVersion.id,
            variables: resolvedVariables,
            checklist: selectedVersion.checklistItems.map((item) => ({
              itemId: item.id,
              checked: checkedItems[item.id] === true
            }))
          }
        : undefined;
      const response = await api<{ messageId: string; status: string }>('/messages', {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          phone,
          displayName: displayName || undefined,
          ...(template ? { template } : { content }),
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined
        })
      });
      setResult(`Pesan ${response.data.status} dengan ID ${response.data.messageId}.`);
      setContent('');
      setPreview(null);
      setCheckedItems({});
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Pesan gagal dibuat.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell eyebrow="Pesan" title="Tulis pesan">
      <section className="compose-card section-card">
        <p className="eyebrow">Durable outbox</p>
        <h2>Pesan WhatsApp baru</h2>
        <p>Pesan dan snapshot template disimpan immutable sebelum worker mengirimkannya.</p>
        <form onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            <label>
              Nomor tujuan
              <input
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+62 812 3456 7890"
              />
            </label>
            <label>
              Nama tampilan
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Opsional"
              />
            </label>
          </div>
          <label>
            Template internal
            <select
              value={templateVersionId}
              onChange={(event) => chooseTemplate(event.target.value)}
            >
              <option value="">Tanpa template</option>
              {templates.flatMap((template) =>
                template.versions
                  .filter(({ status }) => status === 'published')
                  .slice(0, 1)
                  .map((version) => (
                    <option key={version.id} value={version.id}>
                      {template.name} · v{version.version}
                    </option>
                  ))
              )}
            </select>
            <small>Template internal berbeda dari template resmi WhatsApp Business/Meta.</small>
          </label>
          {selectedVersion ? (
            <div className="template-compose-panel">
              <div className="form-grid">
                {selectedVersion.variableSchema.map((variable) => (
                  <label key={variable}>
                    {variableLabels[variable] ?? variable}
                    <input
                      required
                      value={resolvedVariables[variable] ?? ''}
                      onChange={(event) =>
                        setResolvedVariables((current) => ({
                          ...current,
                          [variable]: event.target.value
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              {selectedVersion.checklistItems.length > 0 && (
                <fieldset>
                  <legend>Checklist sebelum pengiriman</legend>
                  {selectedVersion.checklistItems.map((item) => (
                    <label className="check-row" key={item.id}>
                      <input
                        type="checkbox"
                        required={item.required}
                        checked={checkedItems[item.id] === true}
                        onChange={(event) =>
                          setCheckedItems((current) => ({
                            ...current,
                            [item.id]: event.target.checked
                          }))
                        }
                      />
                      {item.label}
                      {item.required ? ' · wajib' : ''}
                    </label>
                  ))}
                </fieldset>
              )}
              <button type="button" disabled={busy} onClick={() => void renderPreview()}>
                Render preview
              </button>
              <label>
                Preview final
                <textarea
                  readOnly
                  value={preview?.renderedBody ?? 'Isi variable lalu render preview.'}
                />
              </label>
            </div>
          ) : (
            <label>
              Isi pesan
              <textarea
                required
                maxLength={4096}
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
              <small>{content.length.toLocaleString('id-ID')} / 4.096</small>
            </label>
          )}
          <label>
            Jadwal pengiriman
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          </label>
          {error && <p className="error-summary">{error}</p>}
          {result && <p className="notice success-notice">{result}</p>}
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? 'Menyimpan…' : 'Masukkan ke outbox'}
          </button>
        </form>
      </section>
    </Shell>
  );
}
