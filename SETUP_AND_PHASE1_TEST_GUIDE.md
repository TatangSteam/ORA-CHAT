# Setup dan Pengujian Fase 1 — WhatsApp Chatbot V2

Status: **Panduan aktif; F0/F1 functional complete, formal gate menunggu container scan**
Versi: **1.1**
Tanggal: **7 Agustus 2026**

## 1. Tujuan dan aturan status

Panduan ini menjelaskan urutan dari setup mesin sampai keputusan lulus/tidak lulus Fase 1. Perintah dibagi menjadi:

- **Tersedia sekarang**: sudah ada setelah F0-WP03 dan dapat dijalankan.
- **Target Fase 0/Fase 1**: kontrak yang wajib dibuat oleh work package berikutnya; jangan menganggap perintah tersebut sudah tersedia sebelum script-nya benar-benar ada.

Fase 1 tidak boleh dimulai sebelum semua F0-WP01 sampai F0-WP08 selesai dan Gate Fase 0 lulus.

## 2. Step 1 — Siapkan mesin development

Baseline yang wajib dipakai:

| Komponen | Target | Kondisi mesin pada 7 Agustus 2026 | Tindakan |
|---|---:|---:|---|
| Node.js | `24.18.0` | `24.18.0` | Sesuai. |
| Corepack | Tersedia | `0.35.0` | Siap. |
| pnpm | `11.20.0` | `11.20.0` | Siap melalui Corepack. |
| Docker Engine | `29.6.2` | `29.6.2` client/server | Cocok setelah upgrade Docker Desktop `4.85.0` pada 8 Agustus 2026. |
| Docker Compose | `5.3.1` | `5.3.1` | Cocok; baseline `5.4.0` dikoreksi karena release tersebut tidak tersedia. |

Verifikasi dari PowerShell:

```powershell
node --version
corepack --version
corepack pnpm --version
docker version --format '{{.Client.Version}}|{{.Server.Version}}'
docker compose version --short
```

Expected setelah upgrade:

```text
Node: 24.18.0
pnpm: 11.20.0
Docker client/server: 29.6.2
Docker Compose: 5.3.1
```

Jangan melanjutkan ke runtime validation bila Docker daemon tidak aktif. Versi host yang belum cocok boleh dipakai untuk functional development bila deviasi dicatat dan contract Compose lulus, tetapi exact-version Gate Fase 0 tetap gagal sampai versi target cocok. Docker Desktop tidak wajib; engine/runtime lain boleh dipakai jika contract Compose yang sama lulus.

## 3. Step 2 — Masuk ke proyek dan install deterministik

Perintah berikut **tersedia sekarang**:

```powershell
Set-Location 'C:\Users\LENOVO\Documents\Project\RAHO\NewChat2.0\New folder\whatsapp-chatbot-v2'
corepack pnpm install --frozen-lockfile
```

Kriteria lulus:

- pnpm mendeteksi root dan 9 workspace app/package.
- `pnpm-lock.yaml` tidak berubah.
- Tidak ada dependency yang memakai range mengambang.
- Build script yang diizinkan hanya package yang tercatat di `allowBuilds`; saat ini hanya `esbuild`.

`.env.example` hanya memuat konfigurasi non-secret. Buat credential lokal acak melalui `corepack pnpm secrets:init`; file pada `.secrets/` tidak boleh dikomit.

## 4. Step 3 — Verifikasi scaffold yang sudah tersedia

Jalankan:

```powershell
corepack pnpm check
```

Perintah tersebut menjalankan policy, format, lint, typecheck, unit/integration/Compose contract test, license/dependency scan, SBOM, dan production build.

Smoke test manual scaffold saat ini:

Terminal API:

```powershell
corepack pnpm --filter @raho/api dev
```

Terminal web:

```powershell
corepack pnpm --filter @raho/web dev
```

Terminal pemeriksaan:

```powershell
Invoke-RestMethod http://localhost:4000/health/live
```

Expected API:

```json
{
  "service": "api",
  "status": "live"
}
```

Buka `http://localhost:3000/login`. App Shell Fase 1 menyediakan login, overview, session, dan safety.

## 5. Step 4 — Selesaikan Fase 0 secara berurutan

Jangan mengerjakan semua perubahan sebagai satu paket. Tutup satu work package beserta evidence sebelum membuka berikutnya.

| Urutan | Work package | Output minimum | Bukti penutupan |
|---:|---|---|---|
| 1 | F0-WP01 Monorepo | Workspace dan exact toolchain | **Selesai** di `work-packages/F0-WP01.md`. |
| 2 | F0-WP02 Quality baseline | Formatter, integration convention, CI, license/dependency scan, SBOM | **Selesai**; frozen/full gate lokal lulus dan workflow siap. Remote CI menunggu repository. |
| 3 | F0-WP03 Compose infrastructure | Service terpisah untuk web, API, worker, WhatsApp, PostgreSQL, queue server, MinIO, dan bootstrap | **Selesai**; Compose contract, build, tujuh health check, init completion, exact service versions, dan secret-log scan lulus. |
| 4 | F0-WP04 Database baseline | Prisma `7.9.1`, migration additive, PostgreSQL `18.4`, pgvector `0.8.6` | **Selesai**; migrate/schema/append-only audit test lulus. |
| 5 | F0-WP05 Queue foundation | BullMQ `6.0.7`, ioredis `5.11.1`, producer/worker, deterministic job ID | **Selesai**; restart queue/worker test lulus. |
| 6 | F0-WP06 MinIO foundation | MinIO `RELEASE.2025-04-22T22-12-26Z`, Console `v1.7.6`, bootstrap idempotent | **Selesai untuk local**; capability smoke lulus, production security exception tetap wajib. |
| 7 | F0-WP07 Shared contracts | Error envelope, pagination, request metadata, health, dan enum domain | **Selesai**; contract test dipakai lintas app. |
| 8 | F0-WP08 App Shell | Design token/layout lama dipindahkan tanpa redesign | **Selesai**; visual dan accessibility comparison lulus. |

Keputusan queue yang telah disetujui menggunakan Redis OSS `8.8.0` AGPLv3. Redis tetap satu service/container tersendiri. BullMQ adalah dependency pada API/worker dan bukan container terpisah.

## 6. Step 5 — Validasi Gate Fase 0

F0-WP03 menyediakan command contract berikut:

```powershell
corepack pnpm secrets:init
docker compose --env-file .env.example config --quiet
docker compose --env-file .env.example pull --ignore-buildable
docker compose --env-file .env.example build --pull
docker compose --env-file .env.example up -d --wait --wait-timeout 120
docker compose --env-file .env.example ps
corepack pnpm test:infra
corepack pnpm test:infra:runtime
```

Kemudian jalankan script target yang harus dibuat F0-WP02 sampai F0-WP06:

```powershell
corepack pnpm test:integration
corepack pnpm test:infra
corepack pnpm license:scan
corepack pnpm dependency:audit
corepack pnpm scan:containers
corepack pnpm version:report
corepack pnpm sbom:generate
```

Gate Fase 0 lulus hanya jika:

- Fresh clone dapat start melalui satu proyek Compose.
- Setiap service memiliki liveness dan readiness yang bermakna.
- Versi PostgreSQL, pgvector, Redis, MinIO, dan Console cocok dengan matrix.
- MinIO diuji sampai bucket/object/version/lifecycle/IAM, bukan hanya HTTP 200.
- Restart Redis/worker tidak menghilangkan durable state PostgreSQL.
- Lint, typecheck, unit, integration, license scan, container scan, version report, dan SBOM mempunyai evidence.

Hasil 8 Agustus 2026: functional dan host-version gate lulus. Gate keseluruhan hanya menunggu container scan yang memerlukan persetujuan eksplisit atas transfer metadata/layer image ke Docker Scout. Lihat `work-packages/F0-GATE.md`.

## 7. Step 6 — Implementasikan Fase 1 dalam work package kecil

Urutan yang direkomendasikan:

1. **F1-WP01 Identity bootstrap** — tenant, admin user, membership, password hashing, dan bootstrap admin tanpa password hardcoded.
2. **F1-WP02 Session auth** — login, logout, expiry, rotation, revocation, opaque cookie, dan CSRF.
3. **F1-WP03 RBAC dan tenant context** — permission middleware serta tenant-scoped repository/API.
4. **F1-WP04 Append-only audit** — login, session, secret mutation, safety action, session reset, dan publish event.
5. **F1-WP05 Operational overview** — dependency readiness, SSE, reconnect, dan polling fallback.
6. **F1-WP06 WhatsApp session control** — state API dan QR short-lived tanpa persistence/logging.
7. **F1-WP07 Safety state** — pause, resume, kill switch, reason, revision, permission, dan audit.
8. **F1-WP08 UI dan visual parity** — login, overview, session, dan safety mengikuti visual baseline.

Setiap work package wajib berisi goal, file yang boleh berubah, non-goal, migration impact, security impact, acceptance criteria, test, evidence, dan rollback.

## 8. Step 7 — Siapkan akun dan data test Fase 1

Fixture otomatis harus membuat data unik per test run:

- Tenant A dan Tenant B.
- Super admin.
- Tenant admin A dan B.
- Operator A dengan permission terbatas.
- User tanpa permission safety/session reset.
- Session aktif, kedaluwarsa, dan revoked.

Aturan fixture:

- Tidak ada password atau secret nyata di source, snapshot, screenshot, maupun report.
- Password test berasal dari environment CI secret atau generator runtime.
- Test tidak bergantung pada urutan eksekusi.
- Cleanup memakai tenant/test-run ID spesifik, bukan menghapus database secara luas.

## 9. Step 8 — Jalankan test otomatis Fase 1

Script berikut tersedia untuk validasi Fase 1:

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:integration
corepack pnpm test:e2e
corepack pnpm test:security
corepack pnpm test:visual
corepack pnpm build
corepack pnpm test:retention
corepack pnpm test:recovery
corepack pnpm test:phase1:functional
```

### 9.1 Auth dan session

Uji minimal:

- Login valid/invalid dan response generik untuk mencegah account enumeration.
- Rate limit login per account dan sumber request.
- Cookie `HttpOnly`, `Secure`, dan `SameSite` sesuai deployment.
- Session token tidak pernah berada dalam JSON, URL, atau `localStorage`.
- CSRF ditolak pada mutation tanpa token yang benar.
- Session ID berotasi saat login; session fixation gagal.
- Logout, expiry, revocation, dan perubahan password menginvalidasi session lama.

### 9.2 RBAC dan isolasi tenant

Buat permission matrix untuk seluruh endpoint dan role. Untuk setiap resource, coba ID Tenant B menggunakan session Tenant A melalui path, query, body, filter, pagination, dan SSE.

Expected:

- Response `403` atau `404` sesuai contract.
- Tidak ada field, jumlah record, timing detail, atau event Tenant B yang bocor.
- Database query tetap tenant-scoped.

### 9.3 Audit log

Pastikan login, logout/revocation, secret mutation, safety action, WhatsApp session reset, dan publish action menghasilkan record. Role aplikasi harus gagal ketika mencoba update/delete audit record. Data sensitif tidak boleh masuk payload audit.

### 9.4 Overview dan SSE

- Status dependency harus sesuai readiness sebenarnya.
- Putuskan jaringan/SSE dan pastikan reconnect menggunakan backoff.
- Nonaktifkan SSE dan pastikan polling fallback bekerja.
- Stream Tenant A tidak menerima event Tenant B.

### 9.5 WhatsApp QR

- Hanya user berizin yang dapat meminta QR.
- QR memiliki expiry pendek dan QR lama tidak berlaku setelah rotasi.
- QR tidak berada di PostgreSQL, Redis permanen, MinIO, log, trace, screenshot, atau test artifact.
- Dua admin yang membuka halaman bersamaan mendapat state konsisten.

### 9.6 Safety state

- Pause/resume/kill switch wajib mempunyai reason dan permission.
- Revision lama ditolak agar concurrent update tidak menimpa state baru.
- Perubahan tersimpan durable, diaudit, dan tetap berlaku setelah restart.
- Worker/API mematuhi state tanpa membuka jalur bypass.

### 9.7 Visual regression

Bandingkan login, overview, session, dan safety pada viewport desktop/mobile dengan visual baseline Gate A. Perubahan di luar tolerance harus mempunyai approval dan alasan aksesibilitas/fungsional yang tertulis.

## 10. Step 9 — Lakukan UAT manual

Gunakan browser bersih/incognito untuk setiap role:

1. Login sebagai super admin; verifikasi overview dan audit.
2. Login sebagai tenant admin A; pastikan tidak dapat membuka Tenant B.
3. Login sebagai operator A; pastikan action terlarang tidak tampil dan API tetap menolak request langsung.
4. Pause sending dengan alasan, coba update memakai revision lama, lalu resume.
5. Buka WhatsApp session, verifikasi QR expiry/rotation, kemudian reset session.
6. Matikan sementara satu dependency dan pastikan overview berubah tanpa membocorkan credential.
7. Logout dan verifikasi back/refresh tidak menghidupkan session lama.

UI yang menyembunyikan tombol bukan pengganti authorization API; kedua lapisan wajib diuji.

## 11. Step 10 — Kumpulkan evidence

Satu run penerimaan Fase 1 harus menghasilkan:

- Commit/source revision dan version report.
- Hasil lint/typecheck/build.
- JUnit/unit/integration/E2E report.
- Permission matrix dan cross-tenant IDOR report.
- Security test report termasuk CSRF, fixation, rate limit, dan secret scan.
- Visual comparison report dengan baseline yang disetujui.
- Redacted log scan yang membuktikan QR/cookie/password/secret tidak bocor.
- Migration up/down atau recovery rehearsal yang relevan.
- Daftar known issue; tidak boleh ada Critical/High yang belum dimitigasi.

Evidence tidak boleh memuat credential, auth cookie, QR, API key, atau data pelanggan.

## 12. Definition of Done Fase 1

Fase 1 baru boleh diberi status **Done** apabila:

- Semua F0-WP01 sampai F0-WP08 berstatus Done dan Gate Fase 0 lulus.
- Semua F1-WP01 sampai F1-WP08 berstatus Done.
- Seluruh script test target tersedia dan lulus dari fresh clone/database kosong.
- Tidak ada skipped test pada gate kritis.
- Permission matrix dan cross-tenant test lulus 100%.
- Session/CSRF/rate-limit/fixation/revocation test lulus.
- Secret/QR/log artifact scan bersih.
- Visual regression disetujui.
- Rollback/recovery telah diuji.
- Evidence path dicatat di development flow dan README.

Jika salah satu kondisi belum terpenuhi, status yang benar adalah **In progress** atau **Blocked**, bukan Done.
