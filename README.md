# WhatsApp Chatbot V2

Status: **F0–F6 functional complete; formal release gate blocked oleh unmitigated container vulnerabilities**

## Dokumen utama

- [Product Requirements](./REQUIREMENTS.md)
- [Entity Relationship Diagram](./ERD.md)
- [AI-Generated Development Flow](./AI_DEVELOPMENT_FLOW.md)
- [Requirement Traceability](./TRACEABILITY.md)
- [Setup dan Pengujian Fase 1](./SETUP_AND_PHASE1_TEST_GUIDE.md)
- [F0-WP01 — Monorepo](./work-packages/F0-WP01.md)
- [F0-WP02 — Quality baseline dan CI](./work-packages/F0-WP02.md)
- [F0-WP03 — Compose infrastructure](./work-packages/F0-WP03.md)
- [F0-WP04 — Database baseline](./work-packages/F0-WP04.md)
- [F0-WP05 — Queue foundation](./work-packages/F0-WP05.md)
- [F0-WP06 — MinIO foundation](./work-packages/F0-WP06.md)
- [F0-WP07 — Shared contracts](./work-packages/F0-WP07.md)
- [F0-WP08 — App Shell](./work-packages/F0-WP08.md)
- [Gate Fase 0](./work-packages/F0-GATE.md)
- [F1 security decisions](./docs/decisions/F1-IDENTITY-SECURITY.md)
- [F1-WP01 — Identity bootstrap](./work-packages/F1-WP01.md)
- [F1-WP02 — Session auth](./work-packages/F1-WP02.md)
- [F1-WP03 — RBAC dan tenant context](./work-packages/F1-WP03.md)
- [F1-WP04 — Append-only audit](./work-packages/F1-WP04.md)
- [F1-WP05 — Operational overview](./work-packages/F1-WP05.md)
- [F1-WP06 — WhatsApp session control](./work-packages/F1-WP06.md)
- [F1-WP07 — Safety state](./work-packages/F1-WP07.md)
- [F1-WP08 — Operational UI](./work-packages/F1-WP08.md)
- [Gate Fase 1](./work-packages/F1-GATE.md)
- [F2-WP01 — Contact dan conversation](./work-packages/F2-WP01.md)
- [F2-WP02 — Incoming ingestion](./work-packages/F2-WP02.md)
- [F2-WP03 — Transactional compose](./work-packages/F2-WP03.md)
- [F2-WP04 — Durable outbox](./work-packages/F2-WP04.md)
- [F2-WP05 — Human handoff](./work-packages/F2-WP05.md)
- [F2-WP06 — Chatbot rules](./work-packages/F2-WP06.md)
- [F2-WP07 — Messaging UI](./work-packages/F2-WP07.md)
- [F2-WP08 — Contract dan acceptance](./work-packages/F2-WP08.md)
- [Gate Fase 2](./work-packages/F2-GATE.md)
- [F3-WP01 — Provider contract dan mock](./work-packages/F3-WP01.md)
- [F3-WP02 — Credential envelope](./work-packages/F3-WP02.md)
- [F3-WP03 — SSRF-safe transport](./work-packages/F3-WP03.md)
- [F3-WP04 — Native adapters](./work-packages/F3-WP04.md)
- [F3-WP05 — Compatible dan OpenClaw](./work-packages/F3-WP05.md)
- [F3-WP06 — Capability dan activation](./work-packages/F3-WP06.md)
- [F3-WP07 — Integrasi AI UI](./work-packages/F3-WP07.md)
- [F3-WP08 — Contract dan acceptance](./work-packages/F3-WP08.md)
- [Gate Fase 3](./work-packages/F3-GATE.md)
- [F3 provider security decisions](./docs/decisions/F3-AI-PROVIDER-SECURITY.md)
- [OpenAPI Admin v1](./docs/openapi/admin-v1.openapi.json)

## Gate A

- [Audit report](./gate-a/GATE_A_REPORT.md)
- [Feature migration matrix](./gate-a/FEATURE_MIGRATION_MATRIX.md)
- [Migration boundary](./gate-a/MIGRATION_BOUNDARY.md)
- [Decision register](./gate-a/DECISION_REGISTER.md)
- [Visual baseline](./gate-a/visual-baseline/MANIFEST.md)

Paket default Gate A disetujui pada 6 Agustus 2026 dan F0–F6 functional complete. Docker host telah sesuai baseline terkoreksi. Pengguna mengizinkan Docker Scout dan inventory selesai pada 11 Agustus 2026, tetapi kelima image Compose gagal policy dengan total 31 Critical dan 110 High occurrence. Formal release gate tetap blocked sampai image dipatch/diganti dan scan ulang tidak menyisakan High/Critical tanpa mitigasi. Lihat [container vulnerability inventory](./docs/security/CONTAINER_VULNERABILITY_INVENTORY.md).

## Menjalankan local stack

```text
corepack pnpm install --frozen-lockfile
corepack pnpm secrets:init
docker compose --env-file .env.example config --quiet
docker compose --env-file .env.example pull --ignore-buildable
docker compose --env-file .env.example build --pull
docker compose --env-file .env.example up -d --wait --wait-timeout 120
corepack pnpm db:migrate
corepack pnpm db:bootstrap
corepack pnpm test:infra:runtime
corepack pnpm test:db
corepack pnpm test:security
corepack pnpm test:ui
corepack pnpm smoke:phase1
corepack pnpm test:retention
corepack pnpm test:recovery
corepack pnpm test:phase1:functional
corepack pnpm smoke:phase2
corepack pnpm test:phase2:functional
corepack pnpm smoke:phase3
corepack pnpm test:phase3:functional
```

Web/login tersedia di `http://127.0.0.1:3000/login`, API live/ready di `http://127.0.0.1:4000/health/live` dan `/health/ready`, serta Console MinIO lokal di `http://127.0.0.1:9001`. Password bootstrap berada hanya pada file lokal ignored `.secrets/bootstrap_admin_password`; nilainya tidak dicetak oleh script. PostgreSQL serta Redis tidak dipublish ke host. Hentikan stack tanpa menghapus data dengan `docker compose --env-file .env.example down`.
