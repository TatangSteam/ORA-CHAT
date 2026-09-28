# EX-WP03 — Agent Management read model

Status: **Reviewable — visual/a11y manual pending**

Goal: Menyediakan halaman Agent Management sebagai tampilan gabungan untuk satu agent WhatsApp tenant, tanpa membuat entitas `Agent` atau mengubah runtime routing.

Input/source of truth: `docs/requirements/OPERATOR_EXPERIENCE_EXTENSION.md` (EX-AGENT), `REQUIREMENTS.md` (FR-RULE, FR-AI-CONFIG, FR-RAG), serta kontrak API yang ada.

Dependency: F2 chatbot rules, F3 AI configuration, F4 knowledge/RAG, dan Shell RBAC.

File/directory yang boleh berubah: `apps/web/src/app/agents/page.tsx`, `apps/web/src/components/shell.tsx`, `apps/web/src/app/globals.css`, `TRACEABILITY.md`, `work-packages/EX-WP03.md`.

Perilaku yang diinginkan: Ringkasan status rule, provider chat/embedding aktif, knowledge terbit, dan shortcut aman menuju konfigurasi asal. Data yang permission-nya tidak dimiliki tidak dimuat atau ditampilkan seolah tersedia.

Non-goal: migration, API resource `Agent`, mutasi/publish dari dashboard baru, multi-agent routing, dan A/B testing.

Data/migration impact: Tidak ada; memakai endpoint existing secara permission-gated.

Security/privacy impact: Tidak menampilkan credential/prompt/trace; setiap data tambahan hanya di-request apabila permission pembacaan asal ada.

Acceptance criteria: Satu agent runtime ditampilkan sebagai gabungan domain yang ada; status ketiadaan data jelas; CTA tidak muncul tanpa permission; halaman hanya read-only; layout keyboard/mobile accessible.

Verification commands: `corepack pnpm exec eslint apps/web/src/app/agents/page.tsx apps/web/src/components/shell.tsx`, `corepack pnpm --filter @raho/web typecheck`, `corepack pnpm --filter @raho/web build`.

Rollback/recovery: Revert file work package; tidak ada data atau backend yang berubah.

Evidence: ESLint halaman dan Shell, typecheck web, serta production build lulus pada 8 September 2026. Visual/a11y runtime belum dijalankan karena stack lokal tidak sedang aktif.
