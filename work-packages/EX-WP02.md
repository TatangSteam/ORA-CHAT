# EX-WP02 — Inbox operator refinement

Status: **Reviewable — visual/a11y manual pending**

Goal: Memperjelas prioritas dan konteks Inbox WhatsApp tanpa mengubah API messaging, outbox, atau state machine handoff.

Input/source of truth: `docs/requirements/OPERATOR_EXPERIENCE_EXTENSION.md` (EX-INBOX), `REQUIREMENTS.md` (FR-INBOX/FR-MESSAGE/FR-HANDOFF), dan F2 messaging implementation.

File/directory yang boleh berubah: `apps/web/src/app/inbox/page.tsx`, `apps/web/src/app/globals.css`, `TRACEABILITY.md`, `work-packages/EX-WP02.md`.

Non-goal: endpoint/schema/migration baru, retry otomatis untuk status unknown, perubahan durable outbox, atau kirim massal.

Security/privacy impact: Kontrol handoff dan send disembunyikan bila permission tidak tersedia; nilai contact tetap memakai representation yang telah dimasking server.

Acceptance criteria: Filter URL-representable, handoff/follow-up/status kirim terlihat, composer menunjukkan batas 4.096 karakter, status unknown mengarahkan ke outbox, dan kontrol mutasi tidak muncul tanpa permission.

Verification commands: `corepack pnpm exec eslint apps/web/src/app/inbox/page.tsx`, `corepack pnpm --filter @raho/web typecheck`, `corepack pnpm --filter @raho/web build`.

Rollback/recovery: Revert file work package; tidak ada perubahan data/backend.

Evidence: ESLint Inbox, typecheck web, dan production build lulus pada 8 September 2026. Visual/a11y runtime belum dijalankan karena stack lokal tidak sedang aktif.
