# F0 Docker baseline correction

Status: **Applied**  
Tanggal: **8 Agustus 2026**

## Context

PRD 1.9 mencantumkan Docker Compose `5.4.0`. Saat Gate Fase 0 ditutup, release tersebut tidak ada pada kanal resmi Docker Compose. Docker Desktop `4.83.0` menyediakan Engine `29.6.2` dan Compose `5.3.1`; Docker Desktop `4.85.0` mempertahankan komponen tersebut dan merupakan update resmi yang tersedia pada host.

## Decision

- Baseline Engine tetap `29.6.2`.
- Baseline Compose dikoreksi menjadi `5.3.1`, versi exact resmi yang benar-benar tersedia dan telah lulus seluruh Compose contract/runtime test proyek.
- Host lokal dinaikkan in-place dari Docker Desktop `4.81.0` ke `4.85.0`; named volume tidak dihapus.
- Koreksi ini tidak mengizinkan floating version atau auto-upgrade berikutnya.

## Evidence

- [Docker Engine 29.6.2 release notes](https://docs.docker.com/engine/release-notes/29/#2962)
- [Docker Desktop release notes](https://docs.docker.com/desktop/release-notes/)
- [Docker Compose official releases](https://github.com/docker/compose/releases)
- `corepack pnpm test:host`
- `corepack pnpm test:infra`
- `corepack pnpm test:infra:runtime`

## Rollback

Jika update host menimbulkan regresi, restore Docker Desktop dilakukan lewat installer resmi sebelumnya tanpa menjalankan `docker compose down --volumes`. Baseline dokumen tidak diturunkan tanpa regression evidence baru.
