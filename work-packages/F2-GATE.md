# Gate Fase 2 — Messaging parity dan durable outbox

Status: **Functional complete; formal gate blocked oleh inherited unmitigated container vulnerabilities**
Tanggal verifikasi functional: **9 Agustus 2026**

## Work package

F2-WP01 sampai F2-WP08 berstatus Done. Migration additive messaging/outbox telah diterapkan dan seluruh producer manual/rule/AI menggunakan jalur durable yang sama.

## Acceptance evidence yang lulus

- Contact/conversation: normalization Indonesia, duplicate prevention, cursor pagination, tenant-scoped lookup.
- Inbound: protected Baileys callback, provider-event idempotency, deterministic published rule/fallback, immutable event timeline.
- Outbound: atomic Message/Event/Outbox/Idempotency/Audit, replay response, request-hash conflict, seven-day key expiry/purge.
- Delivery: PostgreSQL dispatcher, deterministic BullMQ signal, safety enforcement, lease/retry, accepted-provider mock, explicit unknown reconciliation.
- Failure injection: Redis restart recovery, crash-before-send `retryable`, crash-after-send `unknown` tanpa auto-resend.
- Handoff/rules: unique active reason, tenant-member assignment, resolution, ordered version, optimistic revision, atomic publish, isolated playground.
- Security/API: CSRF/RBAC, exhaustive route policy, runtime IDOR, internal bearer boundary, OpenAPI-policy drift test.
- UI: 20 current screenshot baseline at 2% tolerance, desktop/mobile Axe WCAG 2.2 AA, keyboard, dan overflow checks.

Acceptance smoke menghasilkan `status: passed` untuk duplicate HTTP/provider event, immutable timeline, IDOR, Redis reconciliation, crash semantics, metrics, playground isolation, serta shared sources `ai,manual,rule`.

Command functional: `corepack pnpm test:phase2:functional`.

## Remaining inherited blocker

Command formal `corepack pnpm test:phase2` menjalankan Docker Scout lebih dahulu. Authorized scan pada 11 Agustus 2026 menemukan 31 Critical dan 110 High occurrence pada lima image Compose. Gate formal tidak boleh dinyatakan Done sebelum image dipatch/diganti dan scan ulang tidak menyisakan High/Critical tanpa mitigasi tertulis; lihat `docs/security/CONTAINER_VULNERABILITY_INVENTORY.md`.
