# F3 AI provider security decisions

Status: **Accepted for Fase 3**  
Tanggal: **10 Agustus 2026**

## Boundary

- Express adalah satu-satunya pemilik credential, provider request, validation, authorization, audit, dan activation. Browser tidak menerima provider secret atau MinIO credential.
- Automated acceptance memakai adapter `mock`; real API key dan live-provider smoke hanya boleh dijalankan manual/secret CI dengan budget limit.
- Native OpenAI, Anthropic, dan Gemini memakai Base URL resmi yang tidak dapat diedit. Compatible dan OpenClaw memakai Base URL tervalidasi.

## Credential

- Master key 32-byte hex dibaca dari file secret `AI_MASTER_KEY_FILE`; nilainya tidak disimpan di database.
- Setiap secret dienkripsi dengan random data key AES-256-GCM. Data key dibungkus master key dengan nonce terpisah; AAD mengikat tenant, provider, purpose, dan envelope version.
- API hanya mengembalikan `credentialConfigured` dan waktu rotasi. Secret kosong pada update konfigurasi mempertahankan credential; penghapusan memakai aksi revoke eksplisit.
- Perubahan configuration/credential membatalkan tested revision dan menonaktifkan selection aktif sampai test serta activation baru berhasil.

## Outbound policy

- HTTPS wajib untuk public provider. HTTP hanya diizinkan bagi hostname private exact-allowlist; Compose mengizinkan `openclaw:18789`.
- URL userinfo, fragment, unsafe port, localhost, `.local`, private/reserved/metadata/multicast IP, dan DNS resolution campuran ditolak.
- Seluruh jawaban DNS diverifikasi, lalu socket dipin ke address yang telah diverifikasi untuk menahan DNS rebinding. Redirect tidak diikuti.
- Timeout, retry maksimum dua, response maksimum 1 MiB, JSON parser, dan normalized safe error berlaku pada semua adapter.
- OpenClaw mendapat stable opaque tenant/conversation session key, tetapi tidak mendapat tools shell, filesystem, browser, admin, atau upstream vendor key.

## Activation

- Connection hanya dapat diaktifkan saat `healthState=ready` dan `testedRevision=revision`.
- Chat dan embedding dipilih independen. Perubahan model/dimensi embedding ketika index lama aktif menghasilkan `REINDEX_REQUIRED`; index lama tetap dipertahankan.
- Semua create/update/test/credential/activate/deactivate menghasilkan tenant-scoped append-only audit dengan reason dan request ID.
