'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { Shell } from '../../components/shell';
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
            </div>
            <span className="count-badge">{contacts.length}</span>
          </div>
          <label>
            Cari kontak
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nama atau nomor"
            />
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
          <h2>Normalisasi nomor Indonesia</h2>
          <p>Format 08…, 8…, +62…, dan 62… disimpan sebagai nomor canonical 62….</p>
          <form onSubmit={(event) => void submit(event)}>
            <label>
              Nama tampilan
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <label>
              Nomor WhatsApp
              <input
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="081234567890"
              />
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
