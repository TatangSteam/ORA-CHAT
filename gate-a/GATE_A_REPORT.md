# Gate A Report — Legacy Audit dan Baseline Capture

Status: **Passed — audit dan keputusan material disetujui**  
Versi: **1.1**  
Tanggal: **6 Agustus 2026**  
Scope: `whatsapp-chatbot/simple-whatsapp-chatbot` dan `whatsapp-chatbot/whatsapp-control-panel`

## 1. Hasil utama

Gate A telah menyelesaikan inspeksi source, inventaris UI/API/database/environment, pemetaan migrasi fitur, dan capture visual baseline. Seluruh paket keputusan material disetujui pengguna pada 6 Agustus 2026 sehingga Fase 0 dapat dimulai.

Ringkasan evidence:

| Area | Hasil |
|---|---|
| Control panel | 74 source files, 30 page files, 13 test files. |
| Frontend verification | Lint, TypeScript, 79 test pada 13 file, dan production build lulus. |
| Frontend build warning | Main JavaScript chunk `543.19 kB` sebelum gzip; V2 perlu route-level code splitting. |
| Backend | 73 source files, 29 test files, 103 static Admin route registration + 5 generated analytics routes. |
| Database legacy | 37 tabel dan 36 index dibuat melalui satu runtime migration file sepanjang 1.219 baris. |
| Backend verification | 184 test lulus pada 24 file; 4 suite gagal dimuat. Typecheck/build gagal karena package `baileys-antiban` tidak tersedia. |
| Visual baseline | 20 PNG desktop `1440x1200` dan 7 PNG mobile `390x844`; seluruh data adalah fixture. |
| Secrets/data pelanggan | Tidak digunakan pada capture. Fixture runtime hanya berada di `127.0.0.1`. |

## 2. Blocker backend legacy

Folder `whatsapp-chatbot/baileys-antiban` ada tetapi tidak memiliki `package.json` atau source. `node_modules/baileys-antiban` adalah junction menuju folder kosong tersebut.

Dampak yang sudah diverifikasi:

- `npm run typecheck` gagal pada `overview.service.ts` dan `whatsapp.service.ts`.
- `npm test` menghasilkan 24 file lulus dan 184 test lulus, tetapi 4 suite gagal dimuat karena import yang sama.
- Backend lama tidak dapat dinyalakan secara utuh untuk screenshot.
- WhatsApp behavior dan anti-ban wrapper tidak dapat dianggap reproducible hanya dari workspace yang tersedia.

Keputusan Gate A:

- Jangan mengarang atau merekonstruksi package tersebut pada tahap audit.
- Capture UI memakai fixture yang sudah tersedia di frontend melalui adapter HTTP lokal.
- Fase implementasi memakai boundary `WhatsAppAdapter`; Baileys baseline yang dipin pada PRD diintegrasikan ulang melalui contract test.
- Jika behavior anti-ban custom wajib dipertahankan, source package yang hilang harus dipulihkan oleh pemilik produk dan diaudit terpisah.

## 3. Arsitektur legacy yang ditemukan

### Backend

- Express 5 + TypeScript, satu application process.
- SQL PostgreSQL ditulis manual melalui `pg`.
- Migration berjalan saat startup melalui satu fungsi besar, bukan migration history per perubahan.
- WhatsApp, Admin API, document worker, queue connection, dan AI service disusun dari `server.ts`.
- BullMQ digunakan untuk document processing; durable message outbox tetap PostgreSQL.
- Object storage memakai AWS S3 client terhadap endpoint MinIO/S3-compatible.
- AI provider yang benar-benar diimplementasikan hanya `mock` dan `openai-compatible`.

### Frontend

- React 19 + Vite dengan routing manual berbasis `window.history`.
- TanStack Query untuk server state, Zod untuk response parsing.
- Satu `App.tsx` memilih page berdasarkan pathname.
- App Shell dan navigation groups didefinisikan langsung di `AppShell.tsx`.
- Styling memakai 41 baris design token dan satu `global.css` sepanjang 4.043 baris.
- Mock Service Worker hanya dipakai pada test, bukan runtime development.

### Infrastruktur legacy

- Base Compose menjalankan backend dan PostgreSQL/pgvector.
- Compose AI tambahan menjalankan Redis dan MinIO.
- Redis telah menjadi container terpisah; BullMQ adalah dependency Node.js.
- MinIO legacy memakai tag `latest`, root credential untuk aplikasi, satu bucket, dan `mc:latest`; seluruh pola ini harus diganti di V2.
- PostgreSQL legacy adalah pgvector `0.8.2` pada PostgreSQL 16, sedangkan V2 sudah menetapkan baseline baru pada PRD.

## 4. UI baseline

Karakter visual yang wajib dipertahankan:

- Dark operational dashboard.
- Canvas `#050b10`, raised surface `#101b24`, border `#1d2f3d`.
- Accent hijau mint `#78e6bb` dan accent kuat `#34cf94`.
- Topbar dengan brand, environment, session state, risk badge, dan user menu.
- Sidebar berkelompok: Utama, Pengiriman, Koneksi, lalu navigation AI kontekstual.
- Heading memakai eyebrow uppercase, title kuat, dan supporting copy.
- Status badge konsisten untuk success/info/warning/danger.
- Card menggunakan radius besar, border tipis, dan shadow rendah.
- Inbox desktop memakai pola master/detail/inspector; mobile memprioritaskan daftar lalu detail.
- Button utama mint; destructive action tetap merah dan guarded.
- Bahasa UI campuran Indonesia/istilah operasional legacy dipertahankan dahulu, lalu dinormalisasi secara bertahap tanpa mengubah arti.

Perbaikan kecil yang diizinkan pada V2:

- Mobile topbar dan heading memiliki clipping/horizontal overflow pada beberapa capture `390px`; V2 harus memperbaikinya tanpa redesign.
- Global CSS harus dipecah menjadi token, primitive, layout, dan page module agar perubahan tidak saling memengaruhi.
- Route-level code splitting diperlukan untuk menghilangkan warning main chunk di atas 500 kB.
- Focus ring pada heading hasil navigation perlu dipertahankan untuk aksesibilitas tetapi tidak boleh menimbulkan layout shift.

Manifest dan file visual tersedia pada [visual-baseline/MANIFEST.md](./visual-baseline/MANIFEST.md).

## 5. API baseline

Backend mendaftarkan:

- 3 health endpoint;
- 2 service endpoint lama untuk WhatsApp status dan send;
- 1 service-to-service AI runtime endpoint;
- 103 static Admin API registrations;
- 5 analytics route yang dibuat dari loop.

Kelompok Admin API:

| Kelompok | Capability legacy |
|---|---|
| Auth | Login, logout, current admin. |
| Overview/events | Operational summary dan SSE. |
| Session | Status, QR, reconnect, reset. |
| Safety | Pause, resume, reset, stats, metrics. |
| Messaging | Conversations, contacts, create message, outbox, cancel, retry, reconcile, detail. |
| Handoff | List/detail/assign/in-progress/resolve/close; terdapat namespace normal dan AI. |
| Chatbot | Get/update deterministic rules dan test. |
| AI foundation | Foundation, integration, test, activate/deactivate. |
| Knowledge | Category, FAQ/article lifecycle, bulk action, re-index, search test. |
| Document | Upload, list, detail, preview, process/reprocess, archive/delete. |
| AI operations | Playground, test cases, conversations, feedback, unanswered, analytics, readiness, retention, anonymize, export. |

Keputusan migrasi API:

- Prefix `/api/admin/v1` dipertahankan untuk compatibility.
- Express tetap menjadi pemilik business API.
- Zod/shared contracts dan OpenAPI menjadi source contract baru.
- Alias handoff lama dipertahankan sementara melalui compatibility adapter, kemudian didepresiasi setelah frontend V2 tidak memakainya.
- Endpoint `/api/messages/send` tidak menjadi jalur browser; service client yang masih memakainya harus diinventaris sebelum deprecation.
- Next.js tidak memanggil provider AI, MinIO, Redis, atau WhatsApp secara langsung.

## 6. Database baseline

Legacy memiliki 37 tabel:

```text
admin_sessions, admin_tenant_memberships, admin_users, audit_logs,
contacts, messages, message_events, outbox_messages, idempotency_keys,
operational_events, handoff_tasks, safety_control_state,
chatbot_rule_versions, chatbot_rules, tenants,
ai_integrations, ai_prompt_versions, ai_safety_policies,
knowledge_categories, knowledge_items, knowledge_item_versions,
knowledge_question_variants, knowledge_documents, knowledge_chunks,
ai_embedding_usage_logs, ai_conversations, ai_message_traces,
ai_message_sources, ai_admin_feedback, unanswered_questions,
unanswered_question_occurrences, ai_test_cases, ai_test_case_runs,
ai_operational_settings, ai_response_cache, ai_release_readiness,
ai_evaluation_reports
```

Gap terhadap ERD V2:

- `AiProviderConnection` dan `AiProviderCredential` belum terpisah dari `ai_integrations`.
- Tidak ada `AiModelCapabilityCache`.
- Tidak ada `EmbeddingIndexVersion` yang mengatur atomic cutover.
- Tidak ada `KnowledgeStorageObject`; document hanya menyimpan satu `object_key`.
- Tidak ada durable `WhatsAppSessionState`; dokumentasi menyebut `channel_sessions`, tetapi migration tidak membuatnya.
- Tidak ada template, template version, checklist, atau immutable message template snapshot.
- `contacts.id` dan `messages.id` masih `BIGSERIAL`, sedangkan logical IDs lain sudah UUID.
- Banyak tabel lama belum memiliki `tenant_id`, terutama contacts/messages/outbox/events/audit/safety/rules.
- `knowledge_chunks` memakai `ON DELETE CASCADE`, berlawanan dengan retention/audit boundary ERD V2.
- Embedding tersimpan pada kolom `VECTOR` tanpa dimension governance yang cukup untuk multi-provider switching.

Boundary migrasi lengkap tersedia pada [MIGRATION_BOUNDARY.md](./MIGRATION_BOUNDARY.md).

## 7. Environment baseline

Environment legacy yang ditemukan:

| Area | Variable |
|---|---|
| Runtime | `NODE_ENV`, `PORT`, `TRUST_PROXY_HOPS` |
| PostgreSQL | `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` |
| Service auth | `API_KEY`, `WA_AUTH_PATH` |
| Admin bootstrap | `ADMIN_BOOTSTRAP_*`, `SUPERADMIN_BOOTSTRAP_*`, `ADMIN_SESSION_TTL_HOURS`, `ADMIN_ALLOWED_ORIGINS` |
| Safety | `SAFETY_RESET_ENABLED` |
| AI | `AI_CHATBOT_*`, provider/model/base URL/secret ref, alpha runtime flag |
| Queue | `REDIS_URL`, document concurrency |
| Object storage | `OBJECT_STORAGE_*` dan fallback root MinIO credential |
| Frontend | Hanya `VITE_API_BASE_URL` |

V2 harus mengganti environment tersebut dengan typed config per service. Secret tidak boleh memakai prefix frontend `NEXT_PUBLIC_`.

## 8. Feature disposition

Hasil pemetaan lengkap tersedia pada [FEATURE_MIGRATION_MATRIX.md](./FEATURE_MIGRATION_MATRIX.md).

Ringkasannya:

- **Keep visual/behavior:** App Shell, overview, inbox, contact, compose, outbox, session, safety, deterministic chatbot, knowledge governance, AI operations.
- **Migrate implementation:** Vite ke Next.js, SQL manual ke Prisma + raw pgvector migration, routing manual ke App Router, single-process worker ke process boundary.
- **Improve:** tenant isolation, provider abstraction, encrypted credential records, index versioning, MinIO object metadata, queue recovery, CSS modularity, mobile overflow.
- **Retire/deprecate:** floating images, application root MinIO credential, duplicate backend paths setelah compatibility window, environment-only provider configuration, runtime mega-migration.
- **Add:** native OpenAI/Anthropic/Gemini, OpenClaw, template P1, full MinIO bootstrap, named Console operator, embedding cutover, traceability matrix.

## 9. Gate status

| Exit criterion Gate A | Status | Evidence/catatan |
|---|---|---|
| Semua route P0 dipetakan | Lulus | Feature migration matrix. |
| Visual baseline desktop/mobile tersedia | Lulus | 27 PNG + SHA-256 manifest. |
| API/database/environment diinventaris | Lulus | Report dan migration boundary. |
| Legacy build health diketahui | Lulus dengan blocker | Frontend hijau; backend package lokal hilang. |
| Data migration dan rollback boundary ditulis | Lulus | Migration boundary. |
| Keputusan kritis tidak diasumsikan | Lulus | Decision register memisahkan accepted dan pending. |
| Semua keputusan material sudah disetujui | Lulus | Pengguna menyetujui GA-010 sampai GA-015 pada 6 Agustus 2026. |

Status keseluruhan adalah **Passed**. Audit Gate A dan approval decision register selesai; Fase 0 boleh mengunci foundation sesuai keputusan pada [DECISION_REGISTER.md](./DECISION_REGISTER.md).

## 10. Artifact Gate A

- [Gate A report](./GATE_A_REPORT.md)
- [Feature migration matrix](./FEATURE_MIGRATION_MATRIX.md)
- [Migration boundary](./MIGRATION_BOUNDARY.md)
- [Decision register](./DECISION_REGISTER.md)
- [Visual baseline manifest](./visual-baseline/MANIFEST.md)
- [Fixture runtime](./visual-baseline-server.ts)
- [Isolated PostgreSQL Compose](./compose.visual-baseline.yaml)
