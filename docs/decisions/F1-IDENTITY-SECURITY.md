# F1 identity and session security decisions

Status: **Accepted for pilot implementation**  
Tanggal: **7 Agustus 2026**

## Decision

- `AdminUser` bersifat global dan akses tenant diberikan melalui `AdminTenantMembership`.
- Satu `AdminSession` terikat immutable pada satu membership/user/tenant melalui composite foreign key. Memilih tenant lain wajib membuat session baru; request tidak menerima tenant context dari path, query, atau body.
- ID dibuat aplikasi sebagai UUIDv7. Status/role disimpan sebagai string dengan PostgreSQL `CHECK` agar perubahan vocabulary tetap memakai migration eksplisit tanpa mengunci PostgreSQL enum.
- Override permission memiliki bentuk ketat `{ grant: Permission[], deny: Permission[] }`; `deny` selalu diterapkan terakhir.
- Password memakai scrypt bawaan Node dengan `N=2^17`, `r=8`, `p=1`, salt acak 16 byte, dan derived key 64 byte. Nilai tersimpan memakai envelope versioned. Password diperlakukan sebagai Unicode apa adanya dan dibatasi 12–128 karakter/512 byte.
- Session token dan CSRF token masing-masing acak 256-bit. Hanya SHA-256 token yang disimpan. Session memiliki absolute TTL 8 jam, idle TTL 30 menit, maksimum lima session aktif, dan seluruh session user direvoke setelah perubahan password.
- Login memakai pre-session CSRF cookie bertanda HMAC dan custom header; session memakai synchronizer token yang dirotasi oleh `/me`. Session cookie `HttpOnly`, host-only, `SameSite=Lax`, dan `Secure` pada production.
- Login dibatasi lima kegagalan per kombinasi IP/tenant/username selama 15 menit. Delay eksponensial 100–800 ms diterapkan sebelum response generik.
- Audit disimpan append-only; trigger PostgreSQL menolak `UPDATE` dan `DELETE` dari role aplikasi.

## Security basis

OWASP merekomendasikan scrypt `N=2^17, r=8, p=1` ketika Argon2id tidak tersedia dan synchronizer token untuk aplikasi stateful. Implementasi menggunakan primitive Node bawaan untuk mengurangi native dependency tambahan.

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Node.js Crypto API](https://nodejs.org/api/crypto.html)

## Consequence

Global identity dapat memiliki beberapa membership, tetapi tidak ada mekanisme “active tenant” yang dapat dimanipulasi per request. Tenant switch memerlukan login/session rotation. RLS production tetap gate terpisah setelah transaction-scoped tenant context terbukti; pilot lokal mengandalkan composite FK, repository tenant-scoped, dan IDOR test.
