'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { Shell } from '../../components/shell';
import { SectionHelp, FieldHelp } from '../../components/section-help';
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setDocuments((await api<DocumentItem[]>('/ai/documents')).data);
    } catch {
      setLoadError('Dokumen tidak dapat dimuat. Perbarui halaman untuk mencoba lagi.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || uploading) return;
    setUploading(true);
    try {
      await uploadDocument(file);
      setNotice('Dokumen diunggah dan menunggu pemeriksaan.');
      setFile(null);
      await load();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Unggah dokumen gagal.');
    } finally {
      setUploading(false);
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
    <Shell eyebrow="Sumber jawaban AI" title="Dokumen knowledge">
      <section className="section-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Unggah dokumen</p>
            <h2>Tambahkan sumber jawaban</h2>
            <SectionHelp topic="documents-upload" />
            <p>Dokumen diperiksa sebelum tersedia sebagai sumber jawaban AI.</p>
          </div>
        </div>
        <form onSubmit={(event) => void upload(event)}>
          <label>
            Pilih PDF, DOCX, atau TXT (maks. 10 MiB)
            <input
              aria-label="Pilih PDF, DOCX, atau TXT (maks. 10 MiB)"
              aria-describedby="help-documents-1"
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
            />
            <FieldHelp id="help-documents-1">
              Pilih dokumen yang teksnya dapat dibaca. PDF hasil pindai atau gambar mungkin tidak
              menghasilkan teks yang dapat dicari.
            </FieldHelp>
          </label>
          <button className="primary-button" type="submit" disabled={!file || uploading}>
            {uploading ? 'Mengunggah…' : 'Unggah dokumen'}
          </button>
        </form>
        {notice ? (
          <p className="notice" role="status">
            {notice}
          </p>
        ) : null}
      </section>
      <section className="section-card">
        <p className="eyebrow">Daftar dokumen</p>
        <h2>Dokumen privat</h2>
        <SectionHelp topic="documents-list" />
        {loadError ? (
          <p className="error-summary" role="alert">
            {loadError}
          </p>
        ) : null}
        <div className="stack-list" aria-busy={loading}>
          {loading && documents.length === 0 ? (
            <p className="empty-state" role="status">
              Memuat dokumen…
            </p>
          ) : null}
          {!loading && !loadError && documents.length === 0 ? (
            <p className="empty-state">Belum ada dokumen. Unggah sumber jawaban pertama Anda.</p>
          ) : null}
          {documents.map((document) => (
            <article className="list-row" key={document.id}>
              <div>
                <strong>{document.originalFilename}</strong>
                <small>
                  {(document.byteSize / 1024).toFixed(1)} KiB · {document.retryCount} kali diulang
                </small>
                {document.failureCode ? <p>{document.failureCode}</p> : null}
              </div>
              <div className="action-row">
                <span className="state-badge">{document.state.replaceAll('_', ' ')}</span>
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
                    Coba lagi
                  </button>
                ) : null}
                {document.state !== 'archived' ? (
                  <button
                    className="danger-button"
                    onClick={() => void mutate(document, 'archive')}
                  >
                    Arsipkan
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
