# Runbook template pesan internal

Template di aplikasi ini adalah template internal, bukan template resmi WhatsApp Business/Meta.

## Lifecycle

1. Buat template; versi pertama selalu `draft` dan template `inactive`.
2. Render preview dengan hanya variable yang dideklarasikan.
3. Publish draft dengan alasan audit, lalu activate template.
4. Edit dengan membuat versi draft baru. Published version lama tidak dimutasi.
5. Publish versi baru untuk meretire versi published sebelumnya.
6. Deactivate untuk menghentikan pemakaian baru atau archive untuk menutup lifecycle permanen.

## Compose safety

- Browser hanya mengirim version ID, variable, dan checked state.
- API mengambil source dari tenant session dan merender ulang; content browser tidak dipercaya.
- Seluruh source checklist ID harus exact dan unik.
- Required item yang belum checked menghasilkan `409 TEMPLATE_CHECKLIST_REQUIRED` sebelum message/outbox dibuat.
- Message, outbox, template snapshot, dan checklist snapshot dibuat dalam satu transaksi.
- Snapshot bersifat append-only dan tetap dapat diaudit setelah template berubah atau diarsipkan.

## Verification

Jalankan `corepack pnpm smoke:phase6`, `node scripts/check-phase1-database.mjs`, `corepack pnpm test:visual`, dan `corepack pnpm test:a11y`. Smoke menghentikan sementara worker/adapter lokal, memakai pesan berjadwal 2099, langsung membatalkan outbox, lalu selalu memulihkan state WhatsApp dan service melalui `finally`.
