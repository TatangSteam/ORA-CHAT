# Gate Fase 1 — Auth, RBAC, audit, dan operational shell

Status: **Functional complete; blocked oleh inherited unmitigated container vulnerabilities**  
Tanggal verifikasi functional: **8 Agustus 2026**

## Work package

F1-WP01 sampai F1-WP08 berstatus Done. Pada saat gate Fase 1, metrik messaging/handoff menyatakan `metricsAvailable: false`; setelah Fase 2 aktif nilainya `true` dan smoke Fase 1 menerima kedua state kontrak tersebut.

## Acceptance evidence yang lulus

- Host: Docker Desktop `4.85.0`, Engine client/server `29.6.2`, Compose `5.3.1` terkoreksi, Node `24.18.0`, pnpm `11.20.0`.
- Quality: policy, format, lint, strict typecheck, 24 unit test, 10 integration test, 9 security test, license scan 512 package, dependency audit, CycloneDX SBOM, dan production build.
- Auth: opaque secure cookie, CSRF login/session, generic failure, exponential rate limit, fixation denial, idle/absolute expiry, logout/revocation, password-change invalidation, dan 30-day session retention.
- RBAC/IDOR: 12 protected routes × 4 role, deny precedence, serta path/query/body/filter/pagination/QR/SSE tenant isolation.
- Audit: transaction-bound writes, tenant-scoped read, append-only PostgreSQL trigger, dan secret redaction.
- Operational: tujuh dependency status, SSE replay/heartbeat/polling fallback, safety revision conflict, worker delivery gate, serta restart recovery.
- WhatsApp: Baileys `6.7.22`, QR memory-only TTL/rotation/isolation/concurrent consistency, protected internal boundary, real PNG smoke, dan raw-QR log scan.
- UI: delapan visual baseline comparison dan Axe WCAG 2.2 AA pada desktop/mobile; enam Playwright suite lulus.
- Recovery/UAT: scoped PostgreSQL dump/restore mempertahankan migration dan audit trigger; safety UAT mengembalikan state awal; logout cookie lama tetap `401`.

Command functional: `corepack pnpm test:phase1:functional`.

## Remaining inherited blocker

Command formal `corepack pnpm test:phase1` menjalankan Docker Scout lebih dahulu. Authorized scan pada 11 Agustus 2026 menemukan 31 Critical dan 110 High occurrence pada lima image Compose. Fase tidak boleh diberi label Done formal sebelum image dipatch/diganti dan scan ulang tidak menyisakan High/Critical tanpa mitigasi; lihat `docs/security/CONTAINER_VULNERABILITY_INVENTORY.md`.
