'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { Shell } from '../../components/shell';
import { SectionHelp, FieldHelp } from '../../components/section-help';
import { api, ApiError } from '../../lib/api';
import type { ContactSummary } from '../../lib/messaging';

export default function ContactsPage() {
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const { data } = await api<ContactSummary[]>(`/contacts${query}`);
    setContacts(data);
  }, [search]);

  useEffect(() => {
    void load().catch(() => setError('Kontak tidak dapat dimuat.'));
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await api('/contacts', {
        method: 'POST',
        body: JSON.stringify({ phone, displayName: displayName || undefined })
      });
      setPhone('');
      setDisplayName('');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Kontak gagal disimpan.');
    }
  };

  return (
    <Shell eyebrow="Pelanggan" title="Kontak">
      <div className="split-grid">
        <section className="section-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Direktori</p>
              <h2>Kontak WhatsApp</h2>
              <SectionHelp topic="contacts-list" />
            </div>
            <span className="count-badge">{contacts.length}</span>
          </div>
          <label>
            Cari kontak
            <input
              aria-label="Cari kontak"
              aria-describedby="help-contacts-1"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nama atau nomor"
            />
            <FieldHelp id="help-contacts-1">
              Ketik sebagian nama atau nomor. Pencarian hanya menyaring daftar, tidak mengubah data.
            </FieldHelp>
          </label>
          <div aria-label="Daftar kontak" className="data-list bounded-data-list" tabIndex={0}>
            {contacts.map((contact) => (
              <article className="data-row" key={contact.id}>
                <span className="avatar">{(contact.displayName ?? 'K').slice(0, 1)}</span>
                <span>
                  <strong>{contact.displayName ?? 'Tanpa nama'}</strong>
                  <small>{contact.maskedPhone}</small>
                </span>
                <span
                  className={`state-badge ${contact.consentStatus === 'opted_out' ? 'danger' : ''}`}
                >
                  {contact.consentStatus.replace('_', ' ')}
                </span>
              </article>
            ))}
            {contacts.length === 0 && <p className="empty-state">Belum ada kontak.</p>}
          </div>
        </section>
        <section className="section-card">
          <p className="eyebrow">Kontak baru</p>
          <h2>Tambahkan kontak</h2>
          <SectionHelp topic="contacts-create" />
          <p>Gunakan nomor WhatsApp aktif. Format nomor lokal dan +62 dikenali secara otomatis.</p>
          <form onSubmit={(event) => void submit(event)}>
            <label>
              Nama tampilan
              <input
                aria-label="Nama tampilan"
                aria-describedby="help-contacts-2"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
              <FieldHelp id="help-contacts-2">
                Nama untuk mengenali pelanggan, misalnya Ibu Rina. Boleh dikosongkan.
              </FieldHelp>
            </label>
            <label>
              Nomor WhatsApp
              <input
                aria-label="Nomor WhatsApp"
                aria-describedby="help-contacts-3"
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="081234567890"
              />
              <FieldHelp id="help-contacts-3">
                Nomor aktif pelanggan, misalnya 081234567890 atau +6281234567890.
              </FieldHelp>
            </label>
            {error && <p className="error-summary">{error}</p>}
            <button className="primary-button" type="submit">
              Simpan kontak
            </button>
          </form>
        </section>
      </div>
    </Shell>
  );
}
