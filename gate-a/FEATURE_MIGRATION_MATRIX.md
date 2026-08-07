# Gate A Feature Migration Matrix

Status: **Baseline diselesaikan**  
Versi: **1.0**  
Tanggal: **6 Agustus 2026**

Disposition:

- `KEEP` — perilaku dan bahasa visual dipertahankan.
- `MIGRATE` — capability dipertahankan tetapi implementasi teknis diganti.
- `IMPROVE` — dipertahankan dengan perbaikan requirement V2.
- `ADD` — belum ada di legacy dan harus dibuat.
- `DEPRECATE` — dipertahankan sementara untuk compatibility lalu dihapus.
- `DEFER` — bukan P0/pilot saat ini.

## UI dan product capability

| Route/capability legacy | Kondisi sekarang | Disposition V2 | Fase | Catatan acceptance |
|---|---|---|---:|---|
| `/login` | Implemented | KEEP + MIGRATE | 1 | Visual card, brand, dan copy dipertahankan; auth memakai Express session + CSRF. |
| `/overview` | Implemented | KEEP + IMPROVE | 1 | Pertahankan metric cards dan status badges; tambahkan Redis, worker, MinIO, provider chat/embedding. |
| `/inbox` | Implemented | KEEP + MIGRATE | 2 | Pertahankan desktop three-pane dan mobile list/detail; cursor pagination dan SSE tetap. |
| `/inbox/follow-ups` | Implemented | KEEP | 2 | Handoff queue tidak boleh membuat task ganda. |
| `/inbox/:contactId` | Implemented, numeric legacy ID | MIGRATE | 2 | V2 menerima UUID public ID; legacy bridge diperlukan. |
| `/contacts` | Implemented | KEEP + IMPROVE | 2 | Pertahankan search/detail; perketat tenant isolation dan masking. |
| `/contacts/:id` | Implemented | MIGRATE | 2 | Public ID baru tidak membuka internal legacy ID. |
| `/messages/compose` | Implemented | KEEP + IMPROVE | 2 | Semua send melalui transaction message/outbox/idempotency. Template ditambah pada Fase 6. |
| `/messages/outbox` | Implemented | KEEP | 2 | Filter status, retry/cancel/reconcile, dan unknown outcome dipertahankan. |
| `/messages/:id` | Implemented | KEEP + MIGRATE | 2 | Immutable timeline tetap; gunakan UUID logical ID. |
| `/operations/session` | Implemented | KEEP + IMPROVE | 1 | QR short-lived, reconnect/reset guarded, auth state tidak di DB/log. |
| `/operations/safety` | Implemented | KEEP + IMPROVE | 1–2 | Pause/resume/reset, reason, password/permission, audit, dan hard blockers tetap. |
| `/chatbot/rules` | Implemented | KEEP + MIGRATE | 2 | Ordered deterministic rule, optimistic concurrency, atomic publish. |
| Chatbot test console | Embedded pada rules | KEEP | 2 | Tidak wajib menjadi route terpisah. |
| `/ai-chatbot/overview` | Implemented | KEEP + IMPROVE | 3 | Status provider chat, embedding, OpenClaw, retrieval, dan readiness terpisah. |
| `/ai-chatbot/settings` | Hanya mock/openai-compatible | MIGRATE + IMPROVE | 3 | Tambah connection records, native OpenAI/Anthropic/Gemini, OpenClaw, secret replace/delete. |
| `/ai-chatbot/instructions` | Implemented | KEEP + MIGRATE | 4 | Prompt version immutable dan safety policy terpisah. |
| `/ai-chatbot/knowledge` | Implemented | KEEP + IMPROVE | 4 | Governance, versioning, tenant/published filter, re-index guard. |
| `/ai-chatbot/knowledge/documents` | Implemented | KEEP + IMPROVE | 4 | MinIO quarantine/final objects, signature validation, checksum, authorized download. |
| `/ai-chatbot/knowledge/processing` | Implemented | KEEP + MIGRATE | 4 | BullMQ job hanya membawa identifier; state durable di PostgreSQL. |
| `/ai-chatbot/playground` | Implemented | KEEP + IMPROVE | 3–5 | Tidak boleh menjadi penerima WhatsApp; mock/live provider budget boundary. |
| `/ai-chatbot/conversations` | Implemented | KEEP + IMPROVE | 5 | Safe trace, filter, feedback, retention, export audit. |
| `/ai-chatbot/unanswered` | Implemented | KEEP | 5 | Aggregate occurrence dan create draft knowledge tanpa auto-publish. |
| `/ai-chatbot/handoffs` | Implemented | KEEP | 2–5 | Gunakan domain handoff yang sama; AI hanya menambah reason/trace. |
| `/ai-chatbot/analytics` | Implemented | KEEP + IMPROVE | 5 | Normalize latency/usage/cost lintas provider tanpa PII. |
| `AiLaunchReadiness` component | Source ada tetapi tidak diroute/render | ADD | 5 | Hubungkan evaluation report dan release gates secara eksplisit. |
| Message template UI | Requirement-only, belum ada | ADD | 6 | Version, variable, checklist, immutable snapshot. |
| `/operations/queue` | Blueprint-only | DEFER | Pasca-P0 | Overview queue minimum tetap muncul pada dashboard. |
| `/operations/incidents` | Blueprint-only | DEFER | Pasca-P0 | Operational event summary tetap tersedia melalui overview/audit. |
| `/settings/users` | Blueprint-only | DEFER | Pasca-P0 | Bootstrap admin + RBAC P0 tetap wajib; full user management dapat menyusul. |
| `/settings/alerts` | Blueprint-only | DEFER | Pasca-P0 | Alert backend/runbook P0, UI configuration pasca-pilot. |
| `/settings/audit` | Blueprint-only | DEFER | Pasca-P0 | Audit persistence P0; dedicated browser dapat menyusul. |

## Backend dan integration capability

| Capability | Legacy | Disposition V2 | Catatan |
|---|---|---|---|
| Express Admin API | Satu route file 796 baris | KEEP + MIGRATE | Pecah per bounded context, tetapi pertahankan `/api/admin/v1`. |
| Routing frontend | Manual pathname switch | MIGRATE | Next.js App Router; URL yang sudah digunakan tetap dipertahankan. |
| API contracts | Zod di frontend + dua OpenAPI docs | IMPROVE | Shared Zod package dan satu generated/validated OpenAPI source. |
| PostgreSQL access | Raw `pg` | MIGRATE | Prisma untuk CRUD/transaction umum; raw SQL hanya pgvector/advanced locking. |
| Migration | Runtime mega-migration 1.219 baris | DEPRECATE | Prisma migrations + reviewed raw SQL; startup tidak melakukan schema mutation. |
| Durable outbox | PostgreSQL | KEEP + IMPROVE | BullMQ dispatch dengan deterministic job ID dan reconciliation. |
| Document queue | BullMQ + Redis | KEEP + IMPROVE | Separate producer/worker connections dan restart test. |
| Redis | `redis:7-alpine` floating minor | MIGRATE | Exact Redis 8.8.0 atau Valkey 9.1.1 + digest setelah approval. |
| MinIO | `latest`, root credential, one bucket | MIGRATE | Pinned legacy full-console internal image, three buckets, least privilege, metadata table. |
| Object client | AWS S3 SDK | MIGRATE | MinIO JS SDK behind storage repository boundary. |
| AI mock | Implemented | KEEP | Default automated/development provider. |
| OpenAI-compatible | Implemented basic chat/embedding | MIGRATE + IMPROVE | SSRF-safe URL, capability probe, normalized errors/usage. |
| OpenAI native | Tidak ada | ADD | Native Responses + embeddings adapter. |
| Anthropic native | Tidak ada | ADD | Native Messages; tidak valid sebagai native embedding. |
| Gemini native | Tidak ada | ADD | Native generation + embedding. |
| OpenClaw Gateway | Tidak ada | ADD | Private gateway, application-specific agent, no dangerous tools. |
| Provider credential | Encrypted URI di `ai_integrations.secret_ref` | MIGRATE | Dedicated credential envelope table; no plaintext read endpoint. |
| Chat/embedding connection | Fields dalam satu integration row | MIGRATE | Separate connection records dan explicit active pointers. |
| Embedding switch | String version pada chunk | IMPROVE | Building/active/retired index version dan atomic cutover. |
| WhatsApp | Baileys + missing local wrapper | MIGRATE | Adapter boundary + pinned Baileys; wrapper behavior perlu source atau reimplementation review. |
| Health/readiness | Implemented dasar | IMPROVE | Live/ready/dependency detail per process; authenticated MinIO/queue probes. |

## API compatibility disposition

| API | Disposition | Rencana |
|---|---|---|
| `/api/admin/v1/*` | KEEP | Pertahankan prefix dan response envelope; perbedaan kontrak dibuat version-compatible. |
| `/api/admin/v1/handoffs/*` | KEEP | Canonical domain endpoint. |
| `/api/admin/v1/ai-chatbot/handoffs/*` | DEPRECATE | Compatibility alias menuju service yang sama; hapus setelah frontend V2 cutover. |
| `/api/admin/v1/ai-chatbot/*` | KEEP + EVOLVE | Provider connection endpoint baru ditambah tanpa membocorkan secret. |
| `/api/messages/send` | DEPRECATE/VERIFY | Bukan browser API. Cari external caller sebelum menghapus. |
| `/api/whatsapp/status` | DEPRECATE | Digantikan admin session/health contract setelah caller lama dimigrasikan. |
| `/api/admin/v1/ai-chatbot/runtime/respond` | KEEP AS INTERNAL | Rename/segregate service authentication dan private network policy bila diperlukan. |
| `/health`, `/health/live`, `/health/ready` | KEEP + IMPROVE | Tetap unauthenticated minimal response; dependency detail hanya admin/private. |

## Visual disposition

| Elemen | Disposition |
|---|---|
| Dark palette dan mint accent | KEEP exact token baseline. |
| Brand “Control Room / Operasional WhatsApp” | KEEP sampai keputusan branding terpisah. |
| Grouped sidebar dan contextual AI navigation | KEEP. |
| Status badges dan operational cards | KEEP. |
| Desktop three-pane Inbox | KEEP. |
| Mobile collapse/navigation | KEEP behavior, IMPROVE clipping/overflow. |
| One 4.043-line global stylesheet | MIGRATE menjadi modular CSS/tokens tanpa visual redesign. |
| Main bundle >500 kB | IMPROVE dengan App Router/code splitting. |

