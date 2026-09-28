'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { Shell } from '../../components/shell';
import { useSession } from '../../components/use-session';
import { api, ApiError } from '../../lib/api';

interface NotificationSetting {
  phone: string | null;
  enabled: boolean;
  revision: number;
  updatedAt: string | null;
}

export default function HandoffNotificationsPage() {
  const { user } = useSession();
  const canManage = user?.permissions.includes('handoffs.manage') ?? false;
  const [setting, setSetting] = useState<NotificationSetting | null>(null);
  const [phone, setPhone] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [reason, setReason] = useState('Memperbarui penerima notifikasi handoff AI');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api<NotificationSetting>('/handoff-notification-settings');
      setSetting(data);
      setPhone(data.phone ?? '');
      setEnabled(data.enabled);
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Konfigurasi tidak dapat dimuat.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const { data } = await api<NotificationSetting>('/handoff-notification-settings', {
        method: 'POST',
        body: JSON.stringify({
          phone: phone.trim() || null,
          enabled,
          expectedRevision: setting?.revision ?? 0,
          reason
        })
      });
      setSetting(data);
      setPhone(data.phone ?? '');
      setEnabled(data.enabled);
      setNotice(
        data.enabled
          ? 'Notifikasi handoff AI sudah aktif untuk nomor CS ini.'
          : 'Notifikasi handoff AI dinonaktifkan.'
      );
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Konfigurasi gagal disimpan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell eyebrow="Handoff" title="Notifikasi WhatsApp CS">
      <section className="split-grid">
        <article className="section-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Status</p>
              <h2>{setting?.enabled ? 'Notifikasi aktif' : 'Notifikasi nonaktif'}</h2>
            </div>
            <span className={`state-badge ${setting?.enabled ? 'health-ready' : ''}`}>
              {setting?.enabled ? 'aktif' : 'nonaktif'}
            </span>
          </div>
          <p>
            Saat AI membuat handoff baru, sistem mengirim ringkasan pertanyaan member ke nomor
            WhatsApp CS melalui durable outbox.
          </p>
          <dl>
            <div>
              <dt>Nomor penerima</dt>
              <dd>{setting?.phone ? `+${setting.phone}` : 'Belum diatur'}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>{setting?.revision ?? 0}</dd>
            </div>
            <div>
              <dt>Terakhir diperbarui</dt>
              <dd>
                {setting?.updatedAt
                  ? new Date(setting.updatedAt).toLocaleString('id-ID')
                  : 'Belum pernah'}
              </dd>
            </div>
          </dl>
        </article>

        <article className="section-card">
          <p className="eyebrow">Pengaturan penerima</p>
          <h2>Nomor pribadi CS</h2>
          <p>Gunakan format 08… atau 62…. Perubahan berlaku langsung tanpa restart layanan.</p>
          {notice ? (
            <div className="notice" role="status">
              {notice}
            </div>
          ) : null}
          <form onSubmit={(event) => void save(event)}>
            <label>
              Nomor WhatsApp CS
              <input
                type="tel"
                inputMode="tel"
                placeholder="081234567890"
                minLength={8}
                maxLength={32}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required={enabled}
                disabled={!canManage || busy}
              />
            </label>
            <label className="inline-checkbox">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                disabled={!canManage || busy}
              />
              <span>Aktifkan notifikasi saat AI membuat handoff baru</span>
            </label>
            <label>
              Alasan perubahan
              <input
                minLength={8}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                disabled={!canManage || busy}
              />
            </label>
            <button className="primary-button" type="submit" disabled={!canManage || busy}>
              {busy ? 'Menyimpan…' : 'Simpan pengaturan'}
            </button>
            {!canManage ? <p>Anda hanya memiliki akses untuk melihat konfigurasi ini.</p> : null}
          </form>
        </article>
      </section>
    </Shell>
  );
}
