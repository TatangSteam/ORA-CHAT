# Phase 5 operational runbook

## Alert and emergency response

1. Inspect `/ai/alerts`, `/ai/analytics`, Safety Center, dependency readiness, and oldest queue age.
2. For suspected duplicate delivery, pause sending with a reason before reconciliation. Do not clear Redis or delete outbox rows.
3. Acknowledge alerts only after evidence is attached to the incident/audit trail.
4. AI kill switch does not disable Inbox or human handoff.

## Backup, restore, and migration rehearsal

Run `corepack pnpm test:recovery` for physical/logical restore evidence, then `corepack pnpm test:phase5:rehearsal` for dry-run inventory, counts/checksum, quarantine report, resumable M0–M6 checkpoints, and shadow-read comparison. The rehearsal creates a random scoped clone and deletes only that clone and its temporary dump.

Never run a migration against an unidentified database. Capture server/extension versions, row counts, orphan/duplicate reports, and object reconciliation first. Active cookies and raw WhatsApp auth state are not migrated.

## Cutover

1. Pause sending and record the reason.
2. Confirm no `leased`, `dispatching`, or `sending` outbox row remains; reconcile ambiguous attempts.
3. Verify exactly one WhatsApp runtime owns the auth volume.
4. Deploy additive migration once, start V2 in outbound-off mode, compare shadow reads, then verify health and counts.
5. Resume is a separate audited action after verification. Never combine cutover and resume.

## Rollback

Stop V2 completely, reconcile outbox delivery attempts, and only then return WhatsApp ownership to the prior application. Do not drop new tables/columns during stabilization; use an application rollback or forward schema fix. The active embedding pointer may return to the prior version without deleting either index.

## Pilot gate

Readiness must be `ready` before an `approved` decision. Start with a bounded pilot percentage. Any blocker, critical alert, security exception expiry, or emergency pause returns the pilot to zero.

