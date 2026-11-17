import type { ReactNode } from 'react';

export type AppIconName =
  | 'overview'
  | 'inbox'
  | 'contacts'
  | 'agents'
  | 'chatbot'
  | 'integration'
  | 'knowledge'
  | 'documents'
  | 'search'
  | 'review'
  | 'analytics'
  | 'readiness'
  | 'session'
  | 'safety'
  | 'compose'
  | 'templates'
  | 'outbox'
  | 'handoff'
  | 'notifications'
  | 'menu'
  | 'close'
  | 'logout';
const shapes: Record<AppIconName, ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  inbox: (
    <>
      <path d="m4 4-2 10v5a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-5L20 4Z" />
      <path d="M2 14h6l2 3h4l2-3h6" />
    </>
  ),
  contacts: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20v-2a5 5 0 0 1 10 0v2m3-15a3 3 0 0 1 0 6m1 4a5 5 0 0 1 4 5" />
    </>
  ),
  agents: (
    <>
      <rect x="4" y="7" width="16" height="13" rx="3" />
      <path d="M12 3v4m-5 6h.01M17 13h.01M9 17h6M1 11v5m22-5v5" />
    </>
  ),
  chatbot: (
    <>
      <path d="M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0Z" />
      <path d="M7 10h8m-8 4h5" />
    </>
  ),
  integration: (
    <>
      <path d="M8 2v5m8-5v5M6 7h12v3a6 6 0 0 1-12 0V7Zm6 9v6" />
    </>
  ),
  knowledge: (
    <>
      <path d="M12 5v16m0-16C9 3 6 3 2 4v15c4-1 7-1 10 2m0-16c3-2 6-2 10-1v15c-4-1-7-1-10 2" />
    </>
  ),
  documents: (
    <>
      <path d="M14 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8l-6-6Zm0 0v6h6M8 13h8m-8 4h6" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="7.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  review: (
    <>
      <path d="M9 4H5v18h14V4h-4M9 2h6v5H9V2Z" />
      <path d="m8 14 3 3 5-6" />
    </>
  ),
  analytics: (
    <>
      <path d="M3 3v18h18M8 16v-5m5 5V7m5 9v-8" />
    </>
  ),
  readiness: (
    <>
      <path d="m12 2 9 4v6c0 5-5 9-9 10-4-1-9-5-9-10V6l9-4Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  session: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M10 5h4m-3 14h2" />
    </>
  ),
  safety: (
    <>
      <path d="m12 2 9 4v6c0 5-5 9-9 10-4-1-9-5-9-10V6l9-4Z" />
      <path d="M12 8v5m0 4h.01" />
    </>
  ),
  compose: (
    <>
      <path d="m22 2-7 20-4-9L2 9 22 2Zm0 0L11 13" />
    </>
  ),
  templates: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 9v12" />
    </>
  ),
  outbox: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  handoff: (
    <>
      <path d="M3 7h17m-5-5 5 5-5 5M21 17H4m5-5-5 5 5 5" />
    </>
  ),
  notifications: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  logout: (
    <>
      <path d="M9 3H4v18h5m5-14 5 5-5 5m-6-5h11" />
    </>
  )
};
export function AppIcon({ name, size = 20 }: { name: AppIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shapes[name]}
    </svg>
  );
}
