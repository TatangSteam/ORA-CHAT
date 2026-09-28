# Requirement Traceability — WhatsApp Chatbot V2

Status: **Aktif — diperbarui sampai functional gate Fase 6**
Tanggal: **10 Agustus 2026**

| Requirement ID | Work package | API/UI/worker | Entity/migration | Test | Evidence | Status |
|---|---|---|---|---|---|---|
| ARCH-MONOREPO (§8.1–8.2) | F0-WP01 | Web, API, worker, WhatsApp, shared packages | Tidak ada | lint, typecheck, unit, integration, build | `work-packages/F0-WP01.md` | Done |
| NFR-QUALITY (§15) | F0-WP02 | Seluruh workspace dan CI | Tidak ada | format, lint, typecheck, unit/integration, license, audit, SBOM, build | `work-packages/F0-WP02.md` | Done |
| ARCH-COMPOSE (§8.4) | F0-WP03 | Delapan service terpisah; BullMQ bukan container | Named volume kosong; belum ada migration | Compose contract, image build, health/runtime contract | `work-packages/F0-WP03.md` | Done |
| NFR-PINNING (§8.6) | F0-WP03 | Image Node, PostgreSQL/pgvector, Redis, MinIO, mc | Tidak ada | digest contract dan runtime version check | `work-packages/F0-WP03.md` | Done untuk artifact WP03; host Docker masih deviasi tercatat |
| SEC-LOCAL-TOPOLOGY (§8.4, §11) | F0-WP03 | Loopback web/API/MinIO; PostgreSQL/Redis internal | File-based local secrets | secret permission/idempotency test, port/network contract, log leak scan | `work-packages/F0-WP03.md` | Done untuk local development |
| REL-HEALTH (§12) | F0-WP03, F0-WP07 | Live/ready semua process dan authenticated dependency detail | Tidak ada | 4 TCP integration test dan 7 Compose health checks | `work-packages/F0-WP03.md`, `F0-WP07.md` | Done |
| FR-MINIO | F0-WP03, F0-WP06 | Hardened wrapper, bootstrap, service IAM, authenticated readiness | Named volume dan tiga bucket | full capability smoke + idempotency/non-root | `work-packages/F0-WP06.md` | Done local; production security exception pending |
| ARCH-QUEUE | F0-WP05 | BullMQ producer/worker, deterministic job ID, safety gate | PostgreSQL tetap source of truth | unit + Redis/worker restart recovery | `work-packages/F0-WP05.md` | Done |
| ARCH-CONTRACTS | F0-WP07 | Shared envelope/pagination/request/health/domain contracts | Tidak ada | cross-app unit/integration | `work-packages/F0-WP07.md` | Done |
| UI-SHELL | F0-WP08 | Next shell desktop/mobile | Tidak ada | visual baseline + axe WCAG 2.2 AA | `work-packages/F0-WP08.md` | Done |
| ARCH-DATABASE (§8.3) | F0-WP04 | Prisma client + PostgreSQL adapter | 3 additive migration, pgvector, 7 tabel awal | validate/generate/build, migrate deploy, `test:db` | `work-packages/F0-WP04.md` | Done |
| FR-AUTH | F1-WP01–02 | Login/logout/me/password, opaque cookie, CSRF, limiter | Admin user/membership/session | fixation/expiry/revocation + 30-day retention runtime | `work-packages/F1-WP01.md`, `F1-WP02.md` | Done |
| FR-RBAC | F1-WP03 | Express permission middleware, session tenant context | Composite membership/user/tenant FK | exhaustive 12-route × 4-role matrix + query/body/pagination/QR/SSE IDOR | `work-packages/F1-WP03.md` | Done |
| FR-AUDIT | F1-WP04 | Audit list dan transactional writes | Append-only audit trigger/index | DB mutation rejection + restore rehearsal + smoke | `work-packages/F1-WP04.md` | Done untuk scope F1 |
| FR-OVERVIEW | F1-WP05 | Overview, dependency detail, SSE replay, polling fallback, explicit metric availability | Safety state read | replay/isolation unit+integration + runtime smoke | `work-packages/F1-WP05.md` | Done |
| FR-WA | F1-WP06 | Baileys state/reconnect/reset + protected ephemeral QR PNG | WhatsApp state; auth named volume; QR memory-only | expiry/rotation/isolation + runtime QR/log smoke | `work-packages/F1-WP06.md` | Done |
| FR-SAFETY | F1-WP07 | Pause/resume/reset API/UI dan safety-gated worker | Revisioned safety state | CSRF/RBAC + processor unit + queue restart + restored UAT | `work-packages/F1-WP07.md` | Done |
| UI-P0 (§7) | F1-WP08 | Login/overview/session/safety App Router | Tidak ada | build + 8 screenshot baseline + axe desktop/mobile | `work-packages/F1-WP08.md` | Done |
| FR-CONTACT | F2-WP01 | Contact API, conversation list/detail, cursor pagination | Contact + Conversation | normalization/duplicate unit + runtime tenant IDOR | `work-packages/F2-WP01.md` | Done |
| FR-MESSAGING-IN | F2-WP02 | Protected WhatsApp inbound boundary dan deterministic rule routing | Message + immutable MessageEvent | duplicate provider event + append-only trigger smoke | `work-packages/F2-WP02.md` | Done |
| FR-MESSAGING-OUT | F2-WP03 | Manual/rule/AI producer memakai repository yang sama | Message + OutboxMessage + IdempotencyKey dalam transaction | duplicate/replay/hash conflict + shared-source smoke | `work-packages/F2-WP03.md` | Done |
| ARCH-OUTBOX | F2-WP04 | PostgreSQL dispatcher, BullMQ signal, lease/retry/reconcile, WhatsApp send boundary | Outbox state/index dan event timeline | Redis restart, accepted-provider mock, crash before/after send | `work-packages/F2-WP04.md` | Done |
| FR-HANDOFF | F2-WP05 | List/create/assign/resolve handoff | HandoffTask + partial unique active reason | idempotent create, tenant membership assignment, resolution | `work-packages/F2-WP05.md` | Done |
| FR-CHATBOT-RULE | F2-WP06 | Draft/test/publish dan inbound deterministic evaluator | ChatbotRuleVersion + ordered ChatbotRule | unique sequence, revision conflict, atomic publish, isolated playground | `work-packages/F2-WP06.md` | Done |
| API-CONTRACT (§10) | F2-WP08 | OpenAPI 3.1 + shared Zod + route policy | Tidak ada | OpenAPI-policy drift test untuk seluruh protected route | `work-packages/F2-WP08.md` | Done |
| UI-MESSAGING (§7) | F2-WP07 | Inbox/contact/compose/outbox/handoff/chatbot desktop/mobile | Tidak ada | 20 screenshot baseline + Axe/keyboard/overflow | `work-packages/F2-WP07.md` | Done |
| FR-AI-CONFIG | F3-WP01, F3-WP06 | Vendor-neutral connection/test/model/activate API | AiIntegration, AiProviderConnection, capability cache | mock/failure unit + API integration + runtime activation | `work-packages/F3-WP01.md`, `F3-WP06.md` | Done |
| SEC-AI-CREDENTIAL | F3-WP02 | Write-only replace/revoke; no secret response/log | AES-256-GCM envelope with wrapped data key | roundtrip/context/tamper + DB plaintext scan + UI blank-secret | `work-packages/F3-WP02.md` | Done |
| SEC-SSRF | F3-WP03 | DNS/IP validation, DNS pinning, redirect/port/protocol/timeout/size guard | Tidak ada | reserved/private/metadata/redirect contract + runtime metadata denial | `work-packages/F3-WP03.md` | Done |
| FR-AI-PROVIDERS | F3-WP04–05 | OpenAI, Anthropic, Gemini, compatible, OpenClaw and mock adapters | Provider/transport/model configuration | structured output, error matrix, embeddings, unsupported parameter, session key | `work-packages/F3-WP04.md`, `F3-WP05.md` | Done contract; live-provider smoke manual only |
| FR-AI-ACTIVATION | F3-WP06 | Chat/embedding independent selection, tested revision and reindex guard | Integration revision + EmbeddingIndexVersion | stale revision, mixed configuration, explicit activation, REINDEX_REQUIRED | `work-packages/F3-WP06.md` | Done |
| UI-AI (§7) | F3-WP07 | Separate chat/embedding cards and write-only secret controls | Tidak ada | desktop/mobile visual + WCAG/keyboard/overflow | `work-packages/F3-WP07.md` | Done |
| API-CONTRACT (§10) | F3-WP08 | OpenAPI 3.1 and exhaustive 41-route permission policy | Tidak ada | OpenAPI-policy drift + RBAC/CSRF/IDOR acceptance | `work-packages/F3-WP08.md` | Done |
| FR-KNOWLEDGE / FR-RAG | F4-WP01–09 | Knowledge governance, private document pipeline, pgvector retrieval, grounded AI/outbox | 12 tabel knowledge/RAG + immutable triggers | unit/integration/security/runtime/visual | `work-packages/F4-GATE.md` | Done |
| FR-AI-OPS | F5-WP01–09 | Feedback, unanswered, evaluation, analytics, readiness, alert, migration rehearsal | 8 tabel operations + 3 append-only triggers | 71 unit, smoke, rehearsal, visual/a11y | `work-packages/F5-GATE.md` | Functional Done |
| FR-TEMPLATE | F6-WP01–07 | Template API/UI dan compose integration | 5 tabel template/snapshot + 4 integrity triggers | 76 unit, 12 integration, 18 security, smoke/DB/visual/a11y | `work-packages/F6-GATE.md` | Done |
| FR-TEMPLATE-SNAPSHOT | F6-WP04–05 | Server rendering dan durable outbox gate | MessageTemplateSnapshot + checklist snapshot | checklist fail-closed, snapshot immutability, IDOR | `work-packages/F6-GATE.md` | Done |
| EX-OVERVIEW | EX-WP01 | Refinement UI Overview tanpa perubahan kontrak backend | Tidak ada migration; memakai overview read model yang ada | Typecheck, build, visual/a11y, SSE/polling fallback | `work-packages/EX-WP01.md` | Reviewable — visual/a11y manual pending |
| EX-AGENT | EX-WP03 | Agent Management read-only dari rule, AI, knowledge, dan safety yang ada | Tidak ada migration atau resource `Agent` | ESLint, typecheck, build, visual/a11y manual | `work-packages/EX-WP03.md` | Reviewable — visual/a11y manual pending |
| EX-INBOX | EX-WP02 | Refinement operator Inbox tanpa perubahan kontrak outbox/handoff | Tidak ada migration; memakai conversation/outbox/handoff yang ada | ESLint, typecheck, build, visual/a11y manual | `work-packages/EX-WP02.md` | Reviewable — visual/a11y manual pending |
| EX-AGENT lifecycle | EX-WP04 (belum dibuat) | Lifecycle agent bila gap tidak dapat dipenuhi domain yang ada | Tidak ada migration tanpa keputusan eksplisit baru | Visual, a11y, RBAC/CSRF/IDOR, lifecycle | `docs/requirements/OPERATOR_EXPERIENCE_EXTENSION.md` | Proposed |
