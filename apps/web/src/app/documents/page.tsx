'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { Shell } from '../../components/shell';
import { api, ApiError, uploadDocument } from '../../lib/api';

interface DocumentItem {
  id: string;
  originalFilename: string;
  declaredMime: string;
  byteSize: number;
  state: string;
  failureCode: string | null;
  retryCount: number;
  revision: number;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(
    async () => setDocuments((await api<DocumentItem[]>('/ai/documents')).data),
    []
  );
  useEffect(() => {
    void load().catch(() => setNotice('Dokumen tidak dapat dimuat.'));
  }, [load]);

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    try {
      await uploadDocument(file);
      setNotice('Dokumen masuk quarantine dan worker queue.');
      setFile(null);
      await load();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Upload gagal.');
    }
  };

  const mutate = async (document: DocumentItem, action: 'retry' | 'archive') => {
    try {
      await api(`/ai/documents/${document.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          expectedRevision: document.revision,
          reason: `${action === 'retry' ? 'Mengulang pipeline' : 'Mengarsipkan dokumen'} setelah peninjauan`
        })
      });
      await load();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Aksi gagal.');
    }
  };

  return (
    <Shell eyebrow="Private object pipeline" title="Dokumen knowledge">
      <section className="section-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Upload aman</p>
            <h2>Quarantine → validasi → index</h2>
          </div>
        </div>
        <form onSubmit={(event) => void upload(event)}>
          <label>
            Pilih PDF, DOCX, atau TXT (maks. 10 MiB)
            <input
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={!file}>
            Upload melalui Express
          </button>
        </form>
        {notice ? <p className="notice">{notice}</p> : null}
      </section>
      <section className="section-card">
        <p className="eyebrow">Lifecycle</p>
        <h2>Dokumen privat</h2>
        <div className="stack-list">
          {documents.map((document) => (
            <article className="list-row" key={document.id}>
              <div>
                <strong>{document.originalFilename}</strong>
                <small>
                  {(document.byteSize / 1024).toFixed(1)} KiB · retry {document.retryCount}
                </small>
                {document.failureCode ? <p>{document.failureCode}</p> : null}
              </div>
              <div className="action-row">
                <span className="state-badge">{document.state}</span>
                <a
                  className="secondary-button"
                  href={`/api/admin/v1/ai/documents/${document.id}/download`}
                >
                  Unduh
                </a>
                {document.state === 'failed' ? (
                  <button
                    className="secondary-button"
                    onClick={() => void mutate(document, 'retry')}
                  >
                    Retry
                  </button>
                ) : null}
                {document.state !== 'archived' ? (
                  <button
                    className="danger-button"
                    onClick={() => void mutate(document, 'archive')}
                  >
                    Archive
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </Shell>
  );
}
