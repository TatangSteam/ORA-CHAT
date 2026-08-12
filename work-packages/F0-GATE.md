# Gate Fase 0 — Foundation dan local platform

Status: **Blocked oleh unmitigated container vulnerabilities**
Tanggal verifikasi functional terbaru: **8 Agustus 2026**

## Evidence yang lulus

- F0-WP01 sampai F0-WP08 berstatus Done.
- `corepack pnpm check`: policy, format, lint, typecheck, 24 unit test, 10 integration test, license scan 512 package, dependency audit tanpa advisory, CycloneDX SBOM, dan production build lulus.
- `test:infra:runtime`: tujuh service healthy, init selesai, secret/raw-QR log scan bersih, dan versi service cocok.
- `test:db`: tiga migration, tujuh tabel, pgvector `0.8.6`, serta append-only audit lulus.
- `test:minio`: bucket/object/versioning/lifecycle/IAM/least-privilege/quota/event/idempotency/non-root lulus.
- `test:queue`: deterministic job ID dan Redis/worker restart recovery lulus.
- `test:ui`: enam Playwright suite visual/accessibility desktop/mobile lulus.
- Manifest source resmi MinIO commit `0d7408f` mengunci `github.com/minio/console v1.7.6`.

## Blocker

Docker Engine client/server telah cocok pada `29.6.2`; Compose cocok pada baseline terkoreksi `5.3.1`. Pengguna memberi persetujuan eksplisit dan Docker Scout scan selesai pada 11 Agustus 2026. Kelima image Compose gagal policy dengan total 31 Critical dan 110 High occurrence. Ringkasan digest dan keputusan berada di `docs/security/CONTAINER_VULNERABILITY_INVENTORY.md`; raw report lokal berada pada ignored `test-results/container-scan/`.

Legacy MinIO tetap local-only. Image revision ini memiliki authentication bypass S3 umum yang belum dipatch, sehingga hardened-image exception ditolak untuk pilot meskipun private exposure, least privilege, versioning, dan restore drill sudah tersedia.

Gate tidak boleh diubah menjadi Done sampai image diganti/dipatch, finding direview advisory-by-advisory, dan scan ulang tidak menyisakan High/Critical tanpa mitigasi tertulis.
