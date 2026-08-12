# Gate Fase 3 — AI configuration dan multi-provider adapter

Status: **Functional complete; formal gate blocked oleh inherited unmitigated container vulnerabilities**  
Tanggal verifikasi functional: **10 Agustus 2026**

## Work package

F3-WP01 sampai F3-WP08 berstatus Done. Migration AI additive diterapkan; provider boundary, encrypted credential, SSRF-safe transport, independent chat/embedding activation, dan operational UI telah terhubung end-to-end.

## Acceptance evidence yang lulus

- Quality/build: format, lint, strict typecheck, dependency/license audit, CycloneDX SBOM, dan production build.
- Automated tests: 60 unit, 12 integration, dan 18 security tests.
- Provider: mock/OpenAI/Anthropic/Gemini/compatible/OpenClaw contract dan failure matrix; tidak memakai real API key.
- Security: CSRF/RBAC, exhaustive 41-route × 4-role policy, tenant IDOR, credential write-only/ciphertext, safe errors, SSRF metadata denial, DNS pinning, redirect/port/size/timeout guards.
- Persistence: migration ke-5, lima tabel AI, capability cache, tested revision, optimistic activation, append-only audit, dan recovery rehearsal.
- Activation: chat/embedding terpisah, stale revision `409`, config change perlu retest, model/dimension change menghasilkan `REINDEX_REQUIRED` dan mempertahankan index aktif.
- UI: 22 current screenshot baseline, strict desktop/mobile comparison, Axe WCAG 2.2 AA, keyboard, dan overflow checks.
- Full regression: runtime Compose/health/version, database, MinIO, queue, retention, recovery, visual/a11y, serta smoke F1/F2/F3 semuanya `status: passed`.

Command functional: `corepack pnpm test:phase3:functional`.

## Remaining inherited blocker

Command formal `corepack pnpm test:phase3` menjalankan Docker Scout lebih dahulu. Pengguna memberi persetujuan eksplisit dan scan selesai pada 11 Agustus 2026, tetapi kelima image gagal policy dengan total 31 Critical dan 110 High occurrence. Gate formal tetap blocked sampai image dipatch/diganti dan scan ulang tidak menyisakan High/Critical tanpa mitigasi tertulis; lihat `docs/security/CONTAINER_VULNERABILITY_INVENTORY.md`.
