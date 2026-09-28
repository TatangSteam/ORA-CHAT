'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { api, markUserActivity, setCsrfToken } from '../lib/api';
import { useSession } from './use-session';

const navigation = [
  { href: '/overview', label: 'Beranda', permission: 'overview.read', icon: '⌂' },
  { href: '/inbox', label: 'Inbox', permission: 'messages.read', icon: '▤' },
  { href: '/contacts', label: 'Kontak', permission: 'contacts.read', icon: '◎' },
  { href: '/agents', label: 'Agent AI', permission: 'chatbot.read', icon: '✦' },
  { href: '/chatbot', label: 'Chatbot', permission: 'chatbot.read', icon: '◇' },
  { href: '/ai-settings', label: 'Integrasi AI', permission: 'ai.settings.manage', icon: '◈' },
  { href: '/knowledge', label: 'Knowledge', permission: 'knowledge.read', icon: '▧' },
  { href: '/documents', label: 'Dokumen', permission: 'knowledge.read', icon: '▱' },
  { href: '/ai-search', label: 'Uji AI', permission: 'knowledge.read', icon: '⌕' },
  { href: '/ai-operations', label: 'Review AI', permission: 'ai.analytics.read', icon: '✓' },
  { href: '/ai-analytics', label: 'Analytics AI', permission: 'ai.analytics.read', icon: '⌁' },
  { href: '/ai-readiness', label: 'Readiness', permission: 'ai.analytics.read', icon: '△' },
  { href: '/session', label: 'Sesi WhatsApp', permission: 'session.read', icon: '◉' },
  { href: '/safety', label: 'Keamanan', permission: 'safety.read', icon: '◇' }
] as const;

const messageNavigation = [
  { href: '/compose', label: 'Tulis pesan', permission: 'messages.send', icon: '✎' },
  { href: '/templates', label: 'Template', permission: 'templates.read', icon: '▣' },
  { href: '/outbox', label: 'Riwayat', permission: 'messages.read', icon: '≡' },
  { href: '/handoffs', label: 'Handoff', permission: 'handoffs.read', icon: '↔' },
  {
    href: '/handoff-notifications',
    label: 'Notifikasi CS',
    permission: 'handoffs.read',
    icon: '◌'
  }
] as const;

export const Shell = ({
  title,
  eyebrow,
  children
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
}) => {
  const pathname = usePathname();
  const { user, loading } = useSession();
  const [whatsAppConnected, setWhatsAppConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const activityEvents = ['pointerdown', 'keydown', 'touchstart', 'click'] as const;
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, markUserActivity, { capture: true, passive: true });
    }
    return () => {
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, markUserActivity, { capture: true });
      }
    };
  }, []);

  useEffect(() => {
    if (!user?.permissions.includes('session.read')) return;
    let active = true;
    const loadWhatsAppState = async () => {
      try {
        const { data } = await api<{ state: string }>('/session');
        if (active) setWhatsAppConnected(data.state === 'connected');
      } catch {
        if (active) setWhatsAppConnected(null);
      }
    };
    void loadWhatsAppState();
    const interval = window.setInterval(() => void loadWhatsAppState(), 5_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [user]);

  if (loading || !user) {
    return (
      <main className="loading-screen" aria-live="polite">
        Memuat control room…
      </main>
    );
  }

  const logout = async () => {
    await api('/auth/logout', { method: 'POST', body: '{}' });
    setCsrfToken(null);
    window.location.replace('/login');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo" aria-hidden="true">
            <Image src="/rahobot-logo.png" alt="" width={38} height={38} priority />
          </span>
          <span>
            <strong>RAHO</strong>
            <small>Control Room</small>
          </span>
        </div>
        <nav aria-label="Navigasi utama">
          <p className="nav-label">Operasional</p>
          {navigation
            .filter(({ permission }) => user.permissions.includes(permission))
            .map((item) => (
              <Link
                className={pathname === item.href ? 'nav-item active' : 'nav-item'}
                href={item.href}
                key={item.href}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          <p className="nav-label">Pesan</p>
          {messageNavigation
            .filter(({ permission }) => user.permissions.includes(permission))
            .map((item) => (
              <Link
                className={pathname === item.href ? 'nav-item active' : 'nav-item'}
                href={item.href}
                key={item.href}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </Link>
            ))}
        </nav>
        <div className="sidebar-foot">
          <span className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</span>
          <span className="identity">
            <strong>{user.displayName}</strong>
            <small>{user.membership.role.replace('_', ' ')}</small>
          </span>
          <button className="icon-button" onClick={() => void logout()} aria-label="Keluar">
            ↗
          </button>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div>
            <p>{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          <div className="tenant-pill">
            <span
              className={`status-dot ${
                whatsAppConnected === null ? 'muted' : whatsAppConnected ? 'healthy' : 'warning'
              }`}
              role="img"
              aria-label={
                whatsAppConnected === null
                  ? 'Status WhatsApp belum tersedia'
                  : whatsAppConnected
                    ? 'WhatsApp terhubung'
                    : 'WhatsApp tidak terhubung'
              }
              title={
                whatsAppConnected === null
                  ? 'Status WhatsApp belum tersedia'
                  : whatsAppConnected
                    ? 'WhatsApp terhubung'
                    : 'WhatsApp tidak terhubung'
              }
            />
            <Image
              className="tenant-logo"
              src="/favicon.png"
              alt=""
              width={22}
              height={22}
              priority
              unoptimized
            />
            <span>{user.tenant.name}</span>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
};
