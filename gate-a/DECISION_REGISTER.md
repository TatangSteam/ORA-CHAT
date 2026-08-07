# Gate A Decision Register

Status: **Approved — paket default disetujui pengguna**  
Versi: **1.1**  
Tanggal: **6 Agustus 2026**

Approval: **Pengguna menyatakan “setuju” pada 6 Agustus 2026** terhadap seluruh paket default Gate A.

Status keputusan:

- `ACCEPTED` — sudah ditetapkan oleh requirement atau instruksi pengguna.
- `RECOMMENDED` — default teknis aman, masih boleh direvisi sebelum Fase 0.
- `PENDING_APPROVAL` — berdampak material; AI tidak boleh menganggapnya disetujui.
- `DEFERRED` — tidak menghalangi pilot/MVP sesuai scope.

## Keputusan yang sudah diterima

| ID | Keputusan | Status | Dasar |
|---|---|---|---|
| GA-001 | Next.js menjadi frontend; Express menjadi satu-satunya business API. | ACCEPTED | Instruksi pengguna dan PRD. |
| GA-002 | Prisma + PostgreSQL/pgvector menjadi durable data layer. | ACCEPTED | Instruksi pengguna dan PRD. |
| GA-003 | Redis/Valkey berjalan sebagai container datastore tersendiri; BullMQ adalah dependency pada API/worker, bukan container BullMQ. | ACCEPTED | Klarifikasi pengguna dan PRD. |
| GA-004 | MinIO Community full-console memakai server `RELEASE.2025-04-22T22-12-26Z` + Console `v1.7.6`. | ACCEPTED_WITH_SECURITY_GATE | Instruksi pengguna; pilot/production tetap membutuhkan exception. |
| GA-005 | OpenAI, Anthropic, Gemini, OpenAI-compatible, OpenClaw, dan mock didukung melalui adapter. | ACCEPTED | Instruksi pengguna dan PRD. |
| GA-006 | UI lama dipertahankan; hanya perbaikan kecil, field baru, responsive, dan accessibility yang diizinkan tanpa approval desain baru. | ACCEPTED | Instruksi pengguna. |
| GA-007 | Single WhatsApp session untuk MVP, dengan boundary agar multi-session dapat ditambahkan kemudian. | ACCEPTED | PRD current scope. |
| GA-008 | Local bootstrap username/password untuk MVP; OIDC/SSO tidak menjadi dependency pilot. | ACCEPTED | PRD auth requirement. |
| GA-009 | Strict grounding selalu aktif untuk domain kesehatan dan semua outbound WhatsApp melewati durable outbox. | ACCEPTED | PRD safety/reliability. |

## Paket default yang direkomendasikan

| ID | Rekomendasi | Status | Dampak |
|---|---|---|---|
| GA-010 | Pakai **Redis Open Source 8.8.0** karena pengguna menyebut Redis secara eksplisit; pin digest dan terima AGPLv3. Valkey menjadi fallback bila legal menolak AGPL Redis. | ACCEPTED | Menentukan image, license review, dan integration test BullMQ. |
| GA-011 | Gunakan UUIDv7 untuk entity V2 baru. Jangan mengubah `BIGSERIAL` contacts/messages saat migration pertama; tambahkan UUID logical/public ID dan pertahankan legacy ID sampai cutover stabil. | ACCEPTED | Menghindari destructive PK rewrite dan memengaruhi Prisma mapping. |
| GA-012 | Pisahkan embedding dari chunk text melalui versioned embedding record/partition; setiap `EmbeddingIndexVersion` mengunci model + dimension + metric dan memiliki index pgvector dimension-specific. | ACCEPTED | Menentukan Prisma model dan raw SQL migration. |
| GA-013 | Aktifkan PostgreSQL RLS pada production untuk tabel tenant-scoped setelah tenant context transaction pattern terbukti; local/test tetap menguji filter aplikasi dan RLS. | ACCEPTED | Menambah defense-in-depth tetapi memerlukan pooling discipline. |
| GA-014 | Retention awal: session revoked 30 hari; idempotency 7 hari; response cache maksimum 24 jam; export 24 jam; quarantine invalid 7 hari; AI trace 90 hari; message/event 365 hari; audit 730 hari. Semua dapat dipersingkat oleh kebijakan privasi. | ACCEPTED | Berdampak storage, privacy, purge job, dan legal. |
| GA-015 | Self-hosted pilot memakai satu host Compose private network; production target memakai managed TLS/reverse proxy, secret manager, backup terpisah, dan worker yang dapat diskalakan. | ACCEPTED | Menentukan deployment files, backup, dan secret boundary. |
| GA-016 | Encrypted credential di PostgreSQL diperbolehkan untuk local/pilot dengan master key dari secret; production memakai external secret manager/KMS bila tersedia. | RECOMMENDED | Menentukan credential repository boundary. |
| GA-017 | Mock menjadi provider default development. Tidak ada real provider aktif setelah fresh install sampai test dan explicit activation lulus. | RECOMMENDED | Mencegah biaya dan traffic tak disengaja. |
| GA-018 | Fase 0 memakai pnpm monorepo dan exact version matrix PRD; dependency upgrade tidak digabung dengan feature package. | RECOMMENDED | Menentukan workspace dan CI. |

## Keputusan deferred

| ID | Keputusan | Status | Kapan dibuka kembali |
|---|---|---|---|
| GA-019 | WhatsApp Business Cloud API selain Baileys. | DEFERRED | Setelah adapter Baileys pilot stabil. |
| GA-020 | Multi-session WhatsApp. | DEFERRED | Setelah MVP dan kebutuhan tenant/session nyata tersedia. |
| GA-021 | OIDC/SSO dan enterprise identity lifecycle. | DEFERRED | Sebelum GA/enterprise rollout. |
| GA-022 | Template pesan sebagai P0. | DEFERRED | Tetap Fase 6/P1 kecuali pengguna menaikkan prioritas. |
| GA-023 | Queue/incidents/users/alerts UI lengkap yang ada di blueprint tetapi belum diimplementasikan legacy. | DEFERRED | Product prioritization setelah P0 parity. |

## Approval Fase 0

Seluruh keputusan material berikut telah disetujui:

1. GA-010 — Redis 8.8.0 AGPLv3 atau Valkey 9.1.1 BSD-3-Clause.
2. GA-011 — UUIDv7 + legacy BIGINT bridge.
3. GA-012 — versioned/dimension-specific embedding storage.
4. GA-013 — production PostgreSQL RLS.
5. GA-014 — retention default.
6. GA-015 — pilot dan production topology.

Fase 0 boleh dimulai. Perubahan selanjutnya terhadap keputusan ini harus dibuat sebagai decision revision baru dan tidak mengubah artifact yang sudah dipromosikan secara diam-diam.
