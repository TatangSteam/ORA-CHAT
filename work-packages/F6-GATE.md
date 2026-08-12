# Gate Fase 6 — Message template P1

Status: **Functional complete; formal pilot blocked oleh unmitigated container vulnerabilities**  
Tanggal evidence: **10 Agustus 2026**

Lulus:

- additive migration ke-8: 5 tabel template/snapshot dan 4 integrity trigger;
- create/edit-as-new-version/duplicate/publish/activate/deactivate/archive dengan tenant filter, RBAC, CSRF, optimistic version, dan audit;
- lima-variable allowlist, server preview, checklist text symbol, serta batas final 4.096 karakter;
- required checklist fail-closed sebelum message/outbox dan snapshot atomik immutable;
- smoke memakai pesan terjadwal 2099 yang langsung dibatalkan; tidak ada WhatsApp acceptance message dikirim;
- snapshot tetap identik setelah source versi baru dan cross-tenant/unknown ID menghasilkan 404;
- 76 unit tests, 12 integration tests, 18 security tests, Prisma/OpenAPI/typecheck/lint checks;
- 4 baseline Fase 6 serta full visual regression 10/10 dan automated accessibility 8/8 lulus desktop/mobile.

Fitur P1 Fase 6 selesai. Authorized inventory pada 11 Agustus 2026 gagal dengan 31 Critical dan 110 High occurrence; hardened legacy MinIO exception ditolak pada revision ini. Pilot formal belum boleh dibuka sampai image dipatch/diganti dan scan ulang lulus.

Commands: `corepack pnpm test:phase6:functional`; formal inherited gate: `corepack pnpm test:phase6`.
