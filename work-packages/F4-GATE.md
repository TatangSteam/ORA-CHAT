# Gate Fase 4 — Knowledge, MinIO pipeline, dan RAG

Status: **Functional complete; formal gate blocked oleh inherited unmitigated container vulnerabilities**

Tanggal evidence: 10 Agustus 2026.

Lulus:

- strict TypeScript, ESLint, project/Compose policy, Prisma validation;
- 69 unit test dan 12 integration test;
- migration additive diterapkan pada PostgreSQL/pgvector dan image Node 24 production build berhasil;
- smoke end-to-end: governed publish, quarantine/final object, worker extraction, versioned index, hybrid retrieval, citation trace, inbound AI outbox, emergency handoff, malware rejection, retry idempotency, dan IDOR 404;
- visual regression desktop/mobile dan automated accessibility untuk `/knowledge`, `/documents`, `/ai-search`.

Gate formal tetap mewarisi blocker Fase 0: authorized Docker Scout scan pada 11 Agustus 2026 menemukan 31 Critical dan 110 High occurrence pada lima image Compose. Ini tidak mengurangi status functional F4, tetapi melarang klaim pilot-release formal sampai image dipatch/diganti dan scan ulang lulus. Lihat `docs/security/CONTAINER_VULNERABILITY_INVENTORY.md`.

Command utama: `corepack pnpm test:phase4` atau functional-only `corepack pnpm test:phase4:functional`.
