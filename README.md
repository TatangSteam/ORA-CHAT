# RAHO WhatsApp Chatbot

Control room WhatsApp untuk RAHO yang menggabungkan inbox operasional, balasan AI berbasis knowledge, human handoff, notifikasi CS, dan durable message delivery.

> Status: fitur F0–F6 selesai secara fungsional. Release production masih diblokir oleh security gate container, terutama legacy MinIO. Gunakan sebagai local development atau pilot terkontrol sampai temuan pada [container vulnerability inventory](./docs/security/CONTAINER_VULNERABILITY_INVENTORY.md) ditutup atau memperoleh waiver resmi.

## Fitur utama

- Koneksi dan pemantauan sesi WhatsApp.
- Inbox percakapan dengan mode AI atau admin.
- RAG berbasis knowledge dan dokumen RAHO.
- Provider AI vendor-neutral, termasuk OpenAI-compatible.
- Handoff otomatis untuk pertanyaan medis dan calon customer yang berminat.
- Notifikasi WhatsApp ke nomor pribadi CS.
- Durable outbox untuk mencegah pesan hilang atau terkirim ganda.
- Dashboard operasional, audit, analytics, dan AI readiness.

## Arsitektur

Stack dijalankan melalui Docker Compose:

- `web`: Next.js control room.
- `api`: API, autentikasi, messaging, knowledge, dan konfigurasi AI.
- `worker`: durable outbox dan pemrosesan dokumen.
- `whatsapp`: adapter WhatsApp dan penyimpanan sesi.
- `postgres`: data utama dan pgvector.
- `redis`: antrean pekerjaan.
- `minio`: penyimpanan dokumen.

## Persyaratan

- Node.js `24.18.x`
- pnpm `11.20.0`
- Docker Engine dan Docker Compose Plugin

## Menjalankan secara lokal

```bash
corepack enable
corepack prepare pnpm@11.20.0 --activate
corepack pnpm install --frozen-lockfile
corepack pnpm secrets:init

docker compose --env-file .env.example config --quiet
docker compose --env-file .env.example build --pull
docker compose --env-file .env.example up -d --wait --wait-timeout 120

corepack pnpm db:migrate
corepack pnpm db:bootstrap
corepack pnpm db:seed:knowledge
```

`db:seed:knowledge` mengisi tenant `default` secara idempotent dengan knowledge RAHO yang
dikurasi: 9 kategori, 78 item, 80 versi, dan 131 variasi pertanyaan. Perintah aman dijalankan
ulang karena menggunakan upsert. Seed tidak membawa kontak, percakapan, kredensial, dokumen
binary, maupun embedding; dokumen perlu diunggah dan diindeks ulang melalui dashboard VPS.

Layanan lokal:

- Dashboard: <http://127.0.0.1:3000/login>
- API health: <http://127.0.0.1:4000/health/ready>
- MinIO Console: <http://127.0.0.1:9001>

Login awal:

- Tenant: `default`
- Username: `superadmin`
- Password: tersimpan di `.secrets/bootstrap_admin_password`

Jangan menyalin password atau isi `.secrets` ke source code, log, screenshot, maupun Git.

## Konfigurasi awal

Setelah login:

1. Buka **Sesi WhatsApp** dan pindai QR.
2. Buka **Integrasi AI**, simpan credential provider, jalankan uji server-side, lalu aktifkan koneksi chat.
3. Tambahkan dan publish knowledge RAHO.
4. Atur nomor penerima di **Notifikasi CS**.
5. Gunakan **Uji AI** sebelum mengaktifkan balasan otomatis pada percakapan customer.

## Pengujian

```bash
corepack pnpm typecheck
corepack pnpm test:unit
corepack pnpm test:integration
corepack pnpm test:infra:runtime
```

Untuk seluruh quality gate:

```bash
corepack pnpm check
```

## Operasional

```bash
# Melihat status service
docker compose --env-file .env.example ps

# Melihat log
docker compose --env-file .env.example logs -f api worker whatsapp

# Menghentikan service tanpa menghapus data
docker compose --env-file .env.example down
```

Jangan menjalankan `docker compose down -v` kecuali memang ingin menghapus seluruh volume PostgreSQL, Redis, MinIO, dan sesi WhatsApp.

## Deployment

Service web, API, dan MinIO hanya dipublish ke `127.0.0.1`. Untuk pilot VPS, tempatkan reverse proxy HTTPS seperti Caddy atau Nginx di depan port `3000`. Jangan mengekspos PostgreSQL, Redis, API internal, atau MinIO langsung ke internet.

Sebelum production, selesaikan release gate pada [AI development flow](./AI_DEVELOPMENT_FLOW.md) dan tinjau [QC report](./docs/qc/2026-09-25-QC_REPORT.md).

## Dokumentasi lanjutan

- [Requirements](./REQUIREMENTS.md)
- [Entity Relationship Diagram](./ERD.md)
- [AI Development Flow](./AI_DEVELOPMENT_FLOW.md)
- [Traceability](./TRACEABILITY.md)
- [Admin API OpenAPI](./docs/openapi/admin-v1.openapi.json)
- [Security decisions](./docs/decisions/F1-IDENTITY-SECURITY.md)
