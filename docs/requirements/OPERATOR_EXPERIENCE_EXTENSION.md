# Operator Experience Extension — Overview, Inbox, dan Agent Management

Status: **Proposed — disetujui pengguna sebagai arah desain, belum menjadi scope implementasi aktif**
Tanggal: **8 September 2026**
Referensi: `REQUIREMENTS.md`, `ERD.md`, `AI_DEVELOPMENT_FLOW.md`, dan visual baseline V2.

### Keputusan yang dikunci

**Agent Management adalah tampilan gabungan, bukan entitas domain baru.** Halaman ini merangkai konfigurasi yang telah ada—`ChatbotRuleVersion`, koneksi/model AI aktif, safety policy, dan knowledge/index yang dipublikasikan—untuk satu tenant. Tidak boleh dibuat tabel, migration, atau API resource `Agent` mandiri hanya untuk kebutuhan EX-AGENT. Lifecycle publish tetap memakai boundary dan snapshot domain yang sudah ada.

## 1. Tujuan

Meningkatkan keterbacaan status operasional dan kecepatan kerja operator dengan tiga halaman inti yang lebih terstruktur: **Overview**, **Inbox**, dan **Agent Management**. Dokumen ini mengambil prinsip yang baik dari dashboard SaaS modern: hierarki informasi jelas, status mudah dipindai, tindakan penting dekat dengan konteks, dan state kosong/error tidak membingungkan.

Ini bukan instruksi untuk menyalin merek, istilah, aset, atau tata letak Nerra. Bahasa visual ORA-CHAT yang telah disetujui tetap menjadi baseline; perubahan visual harus bersifat evolusioner dan lolos screenshot comparison serta WCAG 2.2 AA.

## 2. Prinsip lintas halaman

- Utamakan status nyata daripada angka dekoratif. Setiap metrik harus mempunyai rentang waktu, timestamp pembaruan, dan state `available`, `degraded`, atau `unavailable`.
- Tindakan berisiko (reset sesi, pause sending, publish agent, handoff) wajib memakai permission backend, CSRF, audit, dan confirmation dengan alasan bila sudah diwajibkan requirement inti.
- Jangan tampilkan secret, token session, QR mentah, JID/nomor lengkap pada layar yang tidak membutuhkannya.
- Status warna bukan satu-satunya pembeda: selalu sertakan label dan/atau ikon yang dapat diakses.
- Semua daftar mendukung loading, empty, error, keyboard navigation, fokus yang terlihat, dan layout mobile.
- Frontend hanya memakai Express API, SSE yang telah ada dengan fallback polling, serta kontrak Zod/OpenAPI bersama.

## 3. EX-OVERVIEW — Overview Operasional

### Tujuan pengguna

Admin, operator, dan viewer dapat memahami kondisi sistem serta prioritas pekerjaan dalam satu layar tanpa menganggap status yang belum tersedia sebagai sehat.

### Struktur halaman

1. Header: sapaan/netral sesuai tenant, timestamp `terakhir diperbarui`, dan tombol refresh. Tombol tindakan cepat hanya muncul berdasarkan permission.
2. **System health strip**: WhatsApp session, sending pause, worker/outbox, Redis, database, MinIO, provider chat, dan provider embedding. Setiap item menampilkan label status, waktu pemeriksaan terakhir, dan link ke detail yang diizinkan.
3. **Kartu metrik operasional** (rentang default 7 hari, dapat diubah): pesan masuk, pesan terkirim, pesan gagal/unknown, percakapan menunggu operator, handoff aktif, dan waktu respons median/P95. Nilai kosong tidak boleh dipresentasikan sebagai nol tanpa label yang menjelaskan.
4. **Prioritas operator**: maksimal lima item paling mendesak, misalnya handoff belum ditugaskan, pesan gagal, pengiriman dijeda, sesi WhatsApp perlu QR, atau feedback AI yang perlu review. Tiap item mempunyai CTA kontekstual.
5. **Aktivitas terbaru**: event aman dari message/handoff/safety/agent publish dengan timestamp dan identitas disamarkan sesuai role.
6. **Tren ringkas**: grafik volume pesan dan outcome handoff/AI untuk rentang waktu terpilih. Jika data belum cukup, gunakan empty state informatif, bukan grafik kosong.

### Permission dan data

- Viewer hanya membaca data yang telah diizinkan; operator tidak menerima kontrol konfigurasi atau safety tingkat admin.
- Tidak boleh menambah endpoint status publik. Detail dependency tetap authenticated dan tenant-scoped.
- Menggunakan data `FR-OVERVIEW`, `FR-HANDOFF`, `FR-MESSAGING-OUT`, dan `FR-AI-OPS` yang telah tersedia. Metrik tambahan hanya boleh ditambahkan setelah definisi, query cost, dan retention-nya disetujui.

### Acceptance criteria

- Status kritis dapat dipindai tanpa membuka halaman lain dan selalu memiliki timestamp/state availability.
- SSE reconnect dan polling fallback tidak menggandakan item aktivitas atau membuat state antar-tenant bocor.
- CTA dari prioritas membuka konteks yang tepat; tidak melakukan mutasi otomatis.
- Screenshot desktop/mobile, axe, dan keyboard test memenuhi visual baseline.

## 4. EX-INBOX — Inbox WhatsApp Berorientasi Operator

### Tujuan pengguna

Operator dapat menemukan percakapan, memahami konteks dan status AI/handoff, lalu membalas secara aman dengan langkah minimum.

### Struktur halaman

1. Kolom daftar percakapan: pencarian debounced, filter status (unread, assigned, handoff, follow-up, failed), last message, timestamp, unread count, dan indikator aman untuk AI/human mode. Tetap memakai cursor pagination; tidak memuat seluruh riwayat sekaligus.
2. Panel percakapan: header kontak tersamarkan sesuai role, status WhatsApp, assignment, dan tindakan handoff. Timeline menampilkan inbound/outbound, delivery state, retry/unknown warning, ringkasan AI trace yang aman, serta event handoff.
3. Composer: template picker, counter 4.096 karakter, preview payload yang aman, reason/error yang dapat ditindaklanjuti, dan pengiriman melalui idempotency key. Tombol kirim nonaktif beserta alasan bila session tidak connected, sending paused, nomor tidak aman, atau permission tidak cukup.
4. Panel konteks yang dapat ditutup pada desktop dan menjadi drawer di mobile: detail kontak, label/follow-up, handoff aktif, dan sumber knowledge/citation yang dipakai AI. Tidak menampilkan prompt, credential, atau trace sensitif ke role yang tidak berwenang.

### Aturan perilaku

- Pengurutan default adalah aktivitas terbaru; perubahan daftar tidak boleh memindahkan percakapan yang sedang dibaca secara mengejutkan. Gunakan indikator percakapan baru dan aksi refresh.
- Filter dan pencarian direpresentasikan di URL agar dapat dibagikan/diulang tanpa menyimpan data rahasia.
- State `unknown` selalu mengarahkan operator ke rekonsiliasi, bukan retry biasa. Inbox tidak boleh menyediakan tombol yang mengakali safety/outbox gate.
- Handoff menjelaskan siapa penanggung jawab, alasan, dan waktu dibuat; assignment diverifikasi backend.
- Mobile memakai satu panel aktif pada satu waktu, dengan cara kembali ke daftar yang jelas dan fokus yang dipulihkan.

### Acceptance criteria

- List/detail tetap tenant-scoped; percobaan IDOR menghasilkan respons aman yang tidak membocorkan keberadaan data.
- Pesan baru tidak dapat terkirim dua kali karena double click, reconnect, atau retry UI.
- Operator dapat menyelesaikan alur cari → buka → pahami status → balas/handoff menggunakan keyboard.
- Loading, empty, error, disconnected, paused, bad-recipient, dan unknown delivery state terdokumentasi dalam screenshot/UI test.

## 5. EX-AGENT — Agent Management

### Definisi

Dalam ORA-CHAT, **agent** adalah konfigurasi operasional yang menggabungkan rule chatbot yang dipublikasikan, koneksi/model AI aktif, safety policy, dan sumber knowledge yang dipakai saat menjawab. Agent bukan akun pengguna, bukan akses shell/tool, dan bukan otomatis berarti banyak agent dapat mengirim ke satu saluran WhatsApp.

### Batas MVP

- Satu agent aktif per tenant untuk inbound WhatsApp pada satu waktu, selaras dengan `FR-RULE` dan konfigurasi runtime saat ini.
- Draf atau agent nonaktif boleh dikonfigurasi serta diuji di playground terisolasi, tetapi tidak menerima atau mengirim pesan WhatsApp pelanggan.
- Multi-agent routing, A/B test, campaign, atau perubahan channel adalah non-goal sampai ada desain routing, biaya, audit, dan migration yang disetujui.

### Struktur halaman

1. Daftar agent: nama, status (`draft`, `ready_to_test`, `active`, `paused`, `archived`), revision, provider/model ringkas, update terakhir, dan indikator test/publish readiness. Angka status tidak boleh menyiratkan runtime aktif bila konfigurasi belum dipublikasikan.
2. Detail agent dengan empat tab:
   - **Identitas & tujuan:** nama, deskripsi internal, bahasa, nada, dan batas operasional non-secret.
   - **Perilaku:** referensi versioned rules, greeting/fallback, handoff policy, dan safety policy yang aktif.
   - **Knowledge & AI:** koneksi chat/embedding yang sudah diaktifkan (tanpa credential), model, index version, dokumen/collection yang dipublikasikan, serta requirement reindex.
   - **Test & rilis:** playground terisolasi, hasil test terbaru, evaluasi/feedback ringkas, diff revision, dan publish/rollback atomik.
3. Status aktif harus dapat terlihat dari daftar dan header detail, termasuk waktu publish serta identitas actor dari audit yang aman.

### Aturan keamanan dan lifecycle

- Hanya Admin dengan `chatbot.manage` dapat mengubah draft; aktivasi/publish memerlukan `ai.activate` dan permission safety yang relevan. Super Admin diperlukan jika perubahan memengaruhi operasi berisiko tinggi yang telah ditetapkan RBAC.
- Semua perubahan memakai optimistic concurrency. Konflik revision tidak boleh menimpa perubahan pengguna lain.
- Publish wajib memvalidasi rule valid, provider chat aktif dan sudah dites, embedding/index kompatibel bila RAG aktif, safety policy tersedia, serta status WhatsApp/sending tidak dipalsukan menjadi sehat.
- Publish dan rollback adalah operasi atomic, audited, dengan confirmation. Runtime hanya membaca snapshot aktif yang valid.
- Credential tetap write-only; halaman agent hanya boleh menampilkan provider, model, test timestamp, capability, dan health yang disanitasi.

### Acceptance criteria

- Pengguna tidak dapat mengaktifkan dua agent untuk routing WhatsApp tenant yang sama.
- Draf dan playground tidak dapat mengirim ke kontak nyata.
- Status readiness menyebut alasan spesifik yang aman, misalnya `provider belum dites` atau `reindex diperlukan`.
- Publish, rollback, failed publish, dan revision conflict tercatat di audit serta diliput unit/integration test.

## 6. Delivery plan

Perubahan ini harus dikerjakan sebagai work package baru setelah gate keamanan/release aktif tidak dilanggar:

1. **EX-WP01 — Overview refinement:** komposisi UI dari read model/endpoint yang ada; tidak menambah metrik atau schema tanpa approval.
2. **EX-WP02 — Inbox refinement:** perbaikan informasi dan interaction state di atas API/outbox/handoff yang ada; kontrak keamanan tidak berubah.
3. **EX-WP03 — Agent read model & draft UI:** definisi agent view dan UI menggunakan rule/AI/knowledge yang telah ada, tanpa mengubah runtime routing atau membuat entitas `Agent`.
4. **EX-WP04 — Agent publish lifecycle:** hanya jika gap lifecycle tidak dapat dipenuhi oleh kontrak yang ada; terlebih dahulu buat decision record, OpenAPI/Zod contract, dan test. Migration tidak termasuk scope kecuali keputusan eksplisit baru mengubah model domain.

Setiap work package wajib memakai format pada `AI_DEVELOPMENT_FLOW.md`, memperbarui `TRACEABILITY.md`, dan menyertakan visual/a11y evidence sebelum dinyatakan selesai.

## 7. Open questions sebelum implementasi

1. Apakah istilah produk akan memakai **Agent AI**, **Asisten**, atau **Chatbot** secara konsisten di UI Indonesia?
2. Apakah follow-up bersifat label/manual pada fase awal, atau memerlukan scheduler dengan consent dan quiet hours? Yang kedua menambah risiko compliance dan membutuhkan requirement terpisah.
3. Metrik bisnis apa yang benar-benar sah untuk ditampilkan: handoff selesai, booking, atau transaksi dari sistem eksternal? Conversion tidak boleh diinferensikan dari chat semata.
