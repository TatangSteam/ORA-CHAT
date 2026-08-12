'use client';

import { type FormEvent, useState } from 'react';

import { api, ApiError, setCsrfToken } from '../../lib/api';

interface LoginUser {
  csrfToken: string;
}

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const csrf = await api<{ csrfToken: string }>('/auth/csrf');
      setCsrfToken(csrf.data.csrfToken);
      const result = await api<LoginUser>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          tenantSlug: form.get('tenantSlug'),
          username: form.get('username'),
          password: form.get('password')
        })
      });
      setCsrfToken(result.data.csrfToken);
      window.location.replace('/overview');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Login gagal. Coba lagi.');
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="brand login-brand">
          <span className="brand-mark" aria-hidden="true">
            ◉
          </span>
          <span>
            <strong>Control Room</strong>
            <small>Operasional WhatsApp</small>
          </span>
        </div>
        <div className="login-copy">
          <p className="eyebrow">Akses administrator</p>
          <h1 id="login-title">Masuk ke control panel</h1>
          <p>Gunakan akun administrator untuk melanjutkan.</p>
        </div>
        {error ? (
          <div className="error-summary" role="alert">
            {error}
          </div>
        ) : null}
        <form onSubmit={(event) => void submit(event)}>
          <input name="tenantSlug" type="hidden" value="default" />
          <label>
            Username
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? 'Memverifikasi…' : 'Masuk'}
          </button>
        </form>
      </section>
    </main>
  );
}
