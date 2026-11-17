'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, markUserActivity, setCsrfToken } from '../lib/api';
import { AppIcon, type AppIconName } from './app-icon';
import { useSession } from './use-session';
import { PageGuide } from './page-guide';

type NavigationItem = { href: string; label: string; permission?: string; icon: AppIconName };
const navigationGroups: { label: string; items: NavigationItem[] }[] = [
  {
    label: 'Ruang kerja',
    items: [
      { href: '/overview', label: 'Beranda', permission: 'overview.read', icon: 'overview' },
      { href: '/inbox', label: 'Inbox', permission: 'messages.read', icon: 'inbox' },
      { href: '/contacts', label: 'Kontak', permission: 'contacts.read', icon: 'contacts' },
      { href: '/compose', label: 'Tulis pesan', permission: 'messages.send', icon: 'compose' },
      { href: '/guidebook', label: 'Buku Panduan', icon: 'knowledge' }
    ]
  },
  {
    label: 'AI & knowledge',
    items: [
      { href: '/agents', label: 'Agent AI', permission: 'chatbot.read', icon: 'agents' },
      { href: '/chatbot', label: 'Chatbot', permission: 'chatbot.read', icon: 'chatbot' },
      {
        href: '/ai-settings',
        label: 'Integrasi AI',
        permission: 'ai.settings.manage',
        icon: 'integration'
      },
      { href: '/knowledge', label: 'Knowledge', permission: 'knowledge.read', icon: 'knowledge' },
      { href: '/documents', label: 'Dokumen', permission: 'knowledge.read', icon: 'documents' },
      { href: '/ai-search', label: 'Uji AI', permission: 'knowledge.read', icon: 'search' },
      {
        href: '/ai-operations',
        label: 'Review AI',
        permission: 'ai.analytics.read',
        icon: 'review'
      },
      {
        href: '/ai-analytics',
        label: 'Analytics AI',
        permission: 'ai.analytics.read',
        icon: 'analytics'
      },
      {
        href: '/ai-readiness',
        label: 'Readiness',
        permission: 'ai.analytics.read',
        icon: 'readiness'
      }
    ]
  },
  {
    label: 'Operasional',
    items: [
      { href: '/session', label: 'Sesi WhatsApp', permission: 'session.read', icon: 'session' },
      { href: '/templates', label: 'Template', permission: 'templates.read', icon: 'templates' },
      { href: '/outbox', label: 'Riwayat', permission: 'messages.read', icon: 'outbox' },
      { href: '/handoffs', label: 'Handoff', permission: 'handoffs.read', icon: 'handoff' },
      {
        href: '/handoff-notifications',
        label: 'Notifikasi CS',
        permission: 'handoffs.read',
        icon: 'notifications'
      },
      { href: '/safety', label: 'Keamanan', permission: 'safety.read', icon: 'safety' }
    ]
  }
];

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
  const [mobile, setMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const sync = () => {
      setMobile(media.matches);
      if (!media.matches) setMenuOpen(false);
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    const activityEvents = ['pointerdown', 'keydown', 'touchstart', 'click'] as const;
    for (const eventName of activityEvents)
      window.addEventListener(eventName, markUserActivity, { capture: true, passive: true });
    return () => {
      for (const eventName of activityEvents)
        window.removeEventListener(eventName, markUserActivity, { capture: true });
    };
  }, []);
  useEffect(() => {
    if (!user?.permissions.includes('session.read')) return;
    let active = true;
    const load = async () => {
      try {
        const { data } = await api<{ state: string }>('/session');
        if (active) setWhatsAppConnected(data.state === 'connected');
      } catch {
        if (active) setWhatsAppConnected(null);
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [user]);
  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !link) return;
    const n = nav.getBoundingClientRect();
    const l = link.getBoundingClientRect();
    if (l.bottom > n.bottom) nav.scrollTop += l.bottom - n.bottom + 12;
    else if (l.top < n.top) nav.scrollTop -= n.top - l.top + 12;
  }, [pathname, user, menuOpen]);
  useEffect(() => {
    if (!mobile || !menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    let frame: number;
    const focusCloseButton = () => {
      const button = closeButtonRef.current;
      if (button && getComputedStyle(button).visibility === 'visible') {
        button.focus({ preventScroll: true });
        if (document.activeElement === button) return;
      }
      frame = requestAnimationFrame(focusCloseButton);
    };
    frame = requestAnimationFrame(focusCloseButton);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),[tabindex="0"]'
        ) ?? []
      ).filter((el) => el.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!sidebarRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
      menuButtonRef.current?.focus();
    };
  }, [mobile, menuOpen]);
  if (loading || !user)
    return (
      <main className="loading-screen" aria-live="polite">
        Memuat control room...
      </main>
    );
  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await api('/auth/logout', { method: 'POST', body: '{}' });
      setCsrfToken(null);
      window.location.replace('/login');
    } catch {
      setLogoutError('Belum berhasil keluar. Coba lagi.');
      setLoggingOut(false);
    }
  };
  const roleLabel = user.membership.role.replaceAll('_', ' ');
  const statusLabel =
    whatsAppConnected === null
      ? 'Status WhatsApp belum tersedia'
      : whatsAppConnected
        ? 'WhatsApp terhubung'
        : 'WhatsApp tidak terhubung';
  return (
    <div className={`app-shell${menuOpen ? ' has-navigation-open' : ''}`}>
      <a className="skip-navigation" href="#main-content">
        Lewati navigasi
      </a>
      {mobile && menuOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Tutup navigasi dari luar"
          tabIndex={-1}
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        id="app-navigation"
        ref={sidebarRef}
        className={`sidebar${menuOpen ? ' is-open' : ''}`}
        role={mobile ? 'dialog' : undefined}
        aria-label="Navigasi aplikasi"
        aria-modal={mobile && menuOpen ? true : undefined}
        aria-hidden={mobile && !menuOpen ? true : undefined}
        inert={mobile && !menuOpen}
      >
        <div className="sidebar-header">
          <Link
            href="/overview"
            className="brand"
            onClick={() => setMenuOpen(false)}
            aria-label="RAHO Control Room, beranda"
          >
            <span className="brand-logo" aria-hidden="true">
              <Image src="/rahobot-logo.png" alt="" width={36} height={36} priority />
            </span>
            <span>
              <strong>RAHO</strong>
              <small>Control Room</small>
            </span>
          </Link>
          <button
            type="button"
            className="navigation-close icon-button"
            ref={closeButtonRef}
            aria-label="Tutup navigasi"
            onClick={() => setMenuOpen(false)}
          >
            <AppIcon name="close" />
          </button>
        </div>
        <nav className="sidebar-nav" ref={navRef} aria-label="Navigasi utama">
          {navigationGroups.map((group) => {
            const items = group.items.filter(
              (item) => !item.permission || user.permissions.includes(item.permission)
            );
            return (
              items.length > 0 && (
                <div className="navigation-group" key={group.label}>
                  <p className="nav-label">{group.label}</p>
                  {items.map((item) => (
                    <Link
                      href={item.href}
                      className={`nav-item${pathname === item.href ? ' active' : ''}`}
                      aria-current={pathname === item.href ? 'page' : undefined}
                      key={item.href}
                      onClick={() => setMenuOpen(false)}
                    >
                      <span className="nav-item-icon">
                        <AppIcon name={item.icon} />
                      </span>
                      <span className="nav-item-label">{item.label}</span>
                      {pathname === item.href && (
                        <span className="nav-current-indicator" aria-hidden="true" />
                      )}
                    </Link>
                  ))}
                </div>
              )
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-foot">
            <span className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</span>
            <span className="identity">
              <strong title={user.displayName}>{user.displayName}</strong>
              <small>{roleLabel}</small>
            </span>
            <button
              type="button"
              className="icon-button logout-button"
              disabled={loggingOut}
              aria-label="Keluar"
              title="Keluar dari akun"
              onClick={() => void logout()}
            >
              <AppIcon name="logout" size={18} />
            </button>
          </div>
          {logoutError && (
            <p className="sidebar-error" role="alert">
              {logoutError}
            </p>
          )}
        </div>
      </aside>
      <div className="main-column" inert={mobile && menuOpen}>
        <header className="topbar">
          <div className="topbar-heading">
            <button
              type="button"
              className="navigation-toggle icon-button"
              ref={menuButtonRef}
              aria-label="Buka navigasi"
              aria-controls="app-navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <AppIcon name="menu" />
            </button>
            <div>
              <p>{eyebrow}</p>
              <h1>{title}</h1>
            </div>
          </div>
          <div className="tenant-pill">
            <span
              className={`status-dot ${whatsAppConnected === null ? 'muted' : whatsAppConnected ? 'healthy' : 'warning'}`}
              role="img"
              aria-label={statusLabel}
              title={statusLabel}
            />
            <Image
              className="tenant-logo"
              src="/favicon.png"
              alt=""
              width={20}
              height={20}
              priority
              unoptimized
            />
            <span>{user.tenant.name}</span>
          </div>
        </header>
        <main className="content" id="main-content" tabIndex={-1}>
          <PageGuide pathname={pathname} />
          {children}
        </main>
      </div>
    </div>
  );
};
