# Gate A Migration Boundary

Status: **Draft boundary — tidak menjalankan migration terhadap database pengguna**  
Versi: **1.0**  
Tanggal: **6 Agustus 2026**

## 1. Batas aman

- Gate A hanya membaca source dan menjalankan database sementara kosong.
- Container pengguna `raho-postgres` pada port `5432` tidak disentuh.
- Tidak ada query atau migration yang dijalankan terhadap database pelanggan/legacy nyata.
- Migration rehearsal wajib memakai backup restore atau clone terlebih dahulu.
- Migration pertama V2 harus additive dan backward-compatible.
- Startup aplikasi V2 tidak boleh otomatis membuat/mengubah schema production.
- WhatsApp lama dan V2 tidak boleh menggunakan auth state yang sama pada saat bersamaan.

## 2. Source schema

Source schema dibuat oleh `simple-whatsapp-chatbot/src/database/migrate.ts` dan terdiri dari 37 tabel. Schema mempunyai tiga generasi data:

1. Core awal: `contacts` dan `messages` dengan `BIGSERIAL`.
2. Control panel: admin, audit, outbox, event, handoff, safety, dan chatbot rule.
3. AI: tenant, integration, prompt, knowledge, document/vector, trace, evaluation, dan operations.

Risiko source schema:

- Migration history tidak terpisah; actual database dapat berbeda tergantung berapa kali runtime lama pernah dijalankan.
- Banyak `ALTER TABLE IF NOT EXISTS` membuat schema drift sulit dideteksi dari source saja.
- `contacts/messages` tidak tenant-scoped.
- Beberapa foreign key memakai cascade yang dapat menghapus history.
- Physical IDs bercampur antara `BIGSERIAL`, UUID, dan composite key.
- Provider credential terenkripsi berada sebagai URI string di `ai_integrations.secret_ref`.
- Document hanya memiliki satu `object_key`, tanpa bucket/version/checksum state lengkap.

Sebelum migration ditulis, wajib ambil evidence dari database clone:

```text
server_version
pgvector extversion
schema/table/column/constraint/index dump
row count per table
null/orphan/duplicate report
contact JID conflict report
message/outbox state report
published version uniqueness report
vector dimension/model/version report
object key existence/checksum sample
encrypted credential format count tanpa membuka secret
```

## 3. Entity mapping

| Legacy | Target V2 | Aksi |
|---|---|---|
| `admin_users` | `AdminUser` | Map existing UUID; backfill status/passwordChangedAt tanpa mengubah password hash. |
| `admin_sessions` | `AdminSession` | Existing session direvoke saat cutover; jangan migrasikan raw active cookie. |
| `tenants` | `Tenant` | Preserve UUID/slug; validasi satu default tenant. |
| `admin_tenant_memberships` | `AdminTenantMembership` | Preserve membership; map legacy granular AI permissions ke role/override. |
| `audit_logs` | `AuditLog` | Add tenant/actor snapshot secara additive; jangan rewrite/delete history. |
| `contacts` | `Contact` | Preserve BIGINT bridge, tambah UUID public/logical ID dan tenant ID setelah conflict audit. |
| `messages` | `Message` | Preserve BIGINT PK bridge dan existing `logical_id`; backfill tenant/conversation secara bertahap. |
| Tidak ada | `Conversation` | Bentuk dari tenant + canonical contact/channel; backfill last message/unread state. |
| `message_events` | `MessageEvent` | Preserve append-only history; map state names tanpa menghapus legacy event. |
| `outbox_messages` | `OutboxMessage` | Preserve state/attempt/lease; tambah deterministic job ID. |
| `idempotency_keys` | `IdempotencyKey` | Preserve hash/request/resource; tenant-scope key baru setelah message mapping. |
| Tidak ada durable table | `WhatsAppSessionState` | Buat baru; hanya metadata non-secret. |
| `handoff_tasks` | `HandoffTask` | Preserve UUID/source message/AI trace; tenant backfill dan normalized status. |
| `safety_control_state` | `SafetyControlState` | Convert singleton global menjadi one-row-per-tenant tanpa membuka sending. |
| `operational_events` | Audit/observability retention | Preserve sementara; V2 boleh memiliki compatibility model sebelum archive. |
| `chatbot_rule_versions` | `ChatbotRuleVersion` | Preserve UUID/version/revision/publish; tambah tenant. |
| `chatbot_rules` | `ChatbotRule` | Preserve priority/order/trigger/action; published history immutable. |
| `ai_integrations` | `AiIntegration` | Preserve tenant/name/flags; keluarkan provider config dan credential ke tabel baru. |
| `ai_integrations.secret_ref` | `AiProviderCredential` | One-shot secure migration; decrypt/re-envelope hanya dalam memory, tanpa log/plaintext file. |
| Provider fields pada `ai_integrations` | `AiProviderConnection` | Buat chat dan embedding connection terpisah, test sebelum active pointer dipindah. |
| Tidak ada | `AiModelCapabilityCache` | Buat kosong; isi dari probe setelah cutover. |
| `ai_prompt_versions` | `AiPromptVersion` | Preserve immutable published content dan approval metadata. |
| `ai_safety_policies` | `AiSafetyPolicy` | Preserve; strict grounding tetap true. |
| `ai_operational_settings` | `AiOperationalSettings` | Map tenant settings dan revision. |
| `knowledge_categories` | `KnowledgeCategory` | Preserve UUID/tree; validasi cycle. |
| `knowledge_items` | `KnowledgeItem` | Preserve stable identity/lifecycle. |
| `knowledge_item_versions` | `KnowledgeItemVersion` | Preserve immutable version/status/content. |
| `knowledge_question_variants` | `KnowledgeQuestionVariant` | Preserve order dan normalize duplicates. |
| `knowledge_documents` | `KnowledgeDocument` | Preserve UUID/metadata/state; jangan menganggap object valid sebelum reconciliation. |
| `knowledge_documents.object_key` | `KnowledgeStorageObject` | Buat source object record dengan bucket legacy, stat object, version/etag/checksum bila tersedia. |
| `knowledge_chunks` | `KnowledgeChunk` + versioned embedding storage | Pisahkan/rebuild vector berdasarkan index decision; content/hash tetap dapat dipertahankan. |
| `ai_embedding_usage_logs` | `AiEmbeddingUsageLog` | Preserve usage metadata; hubungkan ke connection/index bila dapat dibuktikan. |
| `ai_conversations` | `AiConversation` | Preserve UUID; hubungkan ke Conversation yang dibackfill. |
| `ai_message_traces` | `AiMessageTrace` | Preserve safe metadata/usage; jangan menambah raw prompt/response. |
| `ai_message_sources` | `AiMessageSource` | Preserve rank/chunk relation setelah chunk mapping. |
| `ai_admin_feedback` | `AiAdminFeedback` | Preserve reviewer/rating/note dan audit. |
| `unanswered_questions` | `UnansweredQuestion` | Preserve aggregate/status/hash. |
| `unanswered_question_occurrences` | `UnansweredQuestionOccurrence` | Preserve append-only occurrence. |
| `ai_test_cases` | `AiTestCase` | Preserve input/expected behavior. |
| `ai_test_case_runs` | `AiTestRun` | Preserve immutable result. |
| `ai_response_cache` | `AiResponseCache` | Tidak wajib dimigrasikan; default aman adalah invalidate dan rebuild. |
| `ai_release_readiness` | `AiReleaseReadiness` | Preserve evidence sebagai historical record; status pilot kembali blocked sampai V2 gates lulus. |
| `ai_evaluation_reports` | `AiEvaluationReport` | Preserve immutable report. |
| Tidak ada | Template entities | Buat kosong pada Fase 6; tidak ada legacy backfill kecuali source lain diberikan. |

## 4. Migration sequence

### M0 — Backup dan discovery

1. Pause mutation pada clone source.
2. Buat physical backup dan logical dump.
3. Restore ke environment rehearsal terisolasi.
4. Jalankan inventory/read-only anomaly report.
5. Buktikan restore dapat dibuka dan row count cocok.

### M1 — Prisma baseline tanpa mutation

1. Introspect clone.
2. Map model Prisma ke table/column legacy menggunakan `@@map`/`@map`.
3. Tandai pgvector sebagai `Unsupported` dan kelola melalui raw SQL migration.
4. Generate schema diff; expected output pada tahap ini harus nol mutation.

### M2 — Additive bridge

1. Tambah tenant IDs nullable dan UUID public/logical IDs.
2. Tambah Conversation serta mapping rows.
3. Tambah WhatsApp session metadata table.
4. Tambah missing unique/index/check constraint sebagai `NOT VALID` jika volume besar.
5. Jangan mengubah primary key legacy atau menghapus column.

### M3 — Provider dan object storage normalization

1. Buat credential dan provider connection tables.
2. Migrasikan encrypted credential melalui one-shot process.
3. Buat `KnowledgeStorageObject` dari legacy document object key.
4. Reconcile object terhadap MinIO: stat, ETag, size, checksum, version.
5. Object yang hilang/berbeda masuk quarantine report, bukan dianggap ready.

### M4 — Backfill tenant dan conversation

1. Tentukan tenant source melalui explicit mapping, bukan tebakan dari nama.
2. Backfill contacts/messages/outbox/events/handoff/rules/audit.
3. Bentuk Conversation dan link message secara idempotent.
4. Jalankan duplicate phone/JID dan orphan report.
5. Setelah nol anomaly blocking, validate constraints dan ubah kolom wajib menjadi non-null dalam migration terpisah.

### M5 — Embedding migration

1. Buat `EmbeddingIndexVersion` berstatus building.
2. Preserve chunk text/hash/source.
3. Re-embed seluruh published source menggunakan embedding connection yang disetujui.
4. Verifikasi dimension, count, retrieval evaluation, dan citation mapping.
5. Atomic switch active index; vector legacy tidak langsung dihapus.

### M6 — Shadow read dan cutover

1. Jalankan V2 terhadap clone dengan sending/AI outbound hard-off.
2. Bandingkan endpoint read utama antara legacy dan V2.
3. Rehearse pause, outbox drain/reconciliation, single WhatsApp runtime, cutover, dan resume terpisah.
4. Simpan count/checksum/comparison report.
5. Cutover nyata hanya setelah release gate disetujui.

## 5. Rollback boundary

- Application rollback boleh kembali ke legacy selama V2 migration masih additive dan legacy column tetap ada.
- Schema rollback tidak menghapus column/table pada jendela stabilisasi; gunakan forward fix.
- Active embedding index pointer dapat kembali ke versi sebelumnya tanpa menghapus index baru.
- AI provider activation dapat kembali ke mock/off; credential baru tidak diekspor balik plaintext.
- WhatsApp auth volume hanya dimiliki satu runtime. Rollback mematikan V2 sepenuhnya sebelum legacy mengambil ownership.
- Outbox harus direkonsiliasi sebelum rollback untuk mencegah dua runtime mengirim row yang sama.
- MinIO object source tidak dihapus selama rehearsal; V2 object key baru memakai namespace terpisah.

## 6. Validation report minimum

| Check | Release blocker |
|---|---|
| Row count per table/source state | Mismatch tanpa penjelasan. |
| Foreign key/orphan | Semua orphan pada data aktif. |
| Duplicate canonical phone/JID | Conflict belum direview. |
| Message/outbox state | Item sending/unknown tidak direkonsiliasi. |
| Published rule/prompt/knowledge | Lebih dari satu active/published yang tidak valid. |
| Tenant backfill | Record aktif tanpa tenant. |
| Vector dimension/index | Mixed/wrong dimension pada active index. |
| MinIO stat/checksum | Object ready hilang atau checksum berbeda. |
| Secret migration | Plaintext/log/invalid envelope terdeteksi. |
| Audit preservation | Count/history berkurang. |

