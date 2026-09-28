# EX-WP01 — Overview refinement

Status: **Reviewable — visual/a11y manual pending**

Goal: Menjadikan halaman Overview sebagai ringkasan operasional yang mudah dipindai tanpa mengubah kontrak backend atau mengaburkan state tidak tersedia.

Input/source of truth: `REQUIREMENTS.md` (FR-OVERVIEW), `docs/requirements/OPERATOR_EXPERIENCE_EXTENSION.md` (EX-OVERVIEW), `TRACEABILITY.md`, dan implementasi overview F1-WP05/F1-WP08.

Dependency: F1 overview/SSE/polling, F1 RBAC/safety, F2 messaging dan handoff sudah selesai.

File/directory yang boleh berubah:

- `apps/web/src/app/overview/page.tsx`
- `apps/web/src/app/globals.css`
- `TRACEABILITY.md`
- `work-packages/EX-WP01.md`

Perilaku saat ini: Overview menampilkan status dependency dan lima total metrik, namun tanpa actionable priority, loading/error state yang eksplisit, refresh manual, atau label metrik yang ramah operator.

Perilaku yang diinginkan: Overview menyajikan health strip, ringkasan metrik, prioritas yang dihasilkan dari state aman yang tersedia, dan update status yang dapat dipahami pada desktop/mobile.

Non-goal:

- Endpoint, schema, database, metrik periode, analitik tren, atau retention baru.
- Mutasi safety/session dari halaman overview.
- Perubahan domain/permission atau route policy.

Data/migration impact: Tidak ada; hanya memakai `GET /overview` dan SSE `overview` yang ada.

Security/privacy impact: CTA hanya ditampilkan jika permission pengguna tersedia. Tidak ada secret, QR, nomor telepon, atau trace AI yang ditampilkan.

Acceptance criteria:

- Status dependency, sending pause, kill switch, dan risk level memiliki label teks serta timestamp.
- Nilai metrik unavailable tetap ditampilkan sebagai unavailable, bukan nol.
- Prioritas mengarahkan ke halaman terkait tanpa melakukan mutasi otomatis.
- Gagal initial fetch/reconnect dapat dipahami dan dapat dicoba ulang.
- Layout tetap keyboard-accessible dan responsif.

Test yang harus dibuat dahulu: Tidak ada test harness UI terpisah untuk route ini; typecheck/build dan screenshot/a11y manual diperlukan sebelum status Done.

Verification commands:

- `pnpm --filter @raho/web typecheck`
- `pnpm --filter @raho/web build`
- screenshot/a11y manual setelah service lokal tersedia

Rollback/recovery: Revert empat file work package ini; tidak ada perubahan data atau backend.

Open question/blocker: Tidak ada untuk refinement read-only ini. Visual/a11y runtime tidak dijalankan pada turn ini karena stack lokal tidak sedang dijalankan.
