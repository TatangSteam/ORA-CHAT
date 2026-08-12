# F4 — Knowledge, object, index, dan grounding decisions

Status: **Accepted** — 10 Agustus 2026

- Konten terstruktur memakai category → item → immutable version → normalized question variants. Alur valid ialah `draft → in_review → approved → published → archived`; perubahan terhadap versi immutable membuat draft penerus.
- Browser tidak menerima credential atau URL MinIO. Upload dan download selalu diproksi Express dengan tenant dari session. Object key hanya berisi tenant/document UUID, role, dan random UUID.
- Batas upload 10 MiB. PDF, DOCX, dan TXT diverifikasi berdasarkan signature, checksum, archive bounds, active-content checks, serta EICAR deny sebelum ekstraksi.
- Quarantine dan final object dicatat dengan bucket/key/version/etag/SHA-256. Source final harus terverifikasi sebelum document `ready`; retry menggunakan satu logical object per role.
- Chunk menggunakan hash dan sequence deterministic. Embedding disimpan sebagai `pgvector`; query wajib memfilter tenant, active index, dimensi, serta source `published`/`ready`.
- Reindex membuat version `building`; index lama tetap `active`. Sesudah jumlah dan dimensi lengkap, transaksi tunggal meretire index lama, mengaktifkan index baru, mengganti pointer integration, dan membatalkan cache.
- Reindex per tenant diserialisasi di proses worker. BullMQ membawa identifier durable saja, bukan file atau knowledge content.
- Urutan jawaban inbound: safety/restricted check → deterministic rule → hybrid retrieval → bounded prompt → structured generation → citation validation → append-only trace → Message/Outbox. Evidence tidak cukup selalu fallback/handoff.
- Knowledge dianggap data tidak tepercaya. Prompt menempatkannya dalam delimiter dan melarang instruksi dari source. Citation output hanya diterima bila label merujuk chunk yang benar-benar diberikan ke model.
- Retrieval pilot memakai exact pgvector scan dalam active index agar dimensi provider dapat berubah antar-version. ANN/partition per dimensi baru wajib saat volume pilot menunjukkan kebutuhan.
