# F5 — AI operations and launch controls

Status: **Accepted for functional implementation**  
Date: **10 Agustus 2026**

- Feedback stores one current reviewer decision per trace, while every create/revision is preserved in append-only `AuditLog` with the previous and current safe values.
- Unsupported/fallback questions are normalized and hashed; representative text redacts email and phone patterns. Every occurrence is append-only.
- Test runs never create a WhatsApp outbox. Runs and evaluation reports are immutable evidence.
- Analytics is tenant-scoped and returns only status, counts, latency, token/cost normalization, cache, handoff, unanswered, and queue age.
- W3C `traceparent` is accepted at the API edge and safe `traceId`/`requestId` is returned; raw provider errors and message content are excluded from operational metrics.
- Release readiness fails closed. Runtime evaluation alone cannot approve a pilot: `PILOT_EVIDENCE_APPROVED=true` is required after external evidence review, and a blocked record cannot be approved.
- Migration and cutover rehearsal runs only against an isolated restored clone. Production schema rollback is forward-fix; application rollback retains additive columns.

