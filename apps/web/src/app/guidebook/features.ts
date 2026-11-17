import type { sectionHelp } from '../../components/section-help';

type Feature = {
  path: string;
  title: string;
  group: string;
  permission: string;
  topics: Array<keyof typeof sectionHelp>;
  example: string;
};

export const features: Feature[] = [
  {
    path: '/overview',
    title: 'Beranda',
    group: 'Ruang kerja',
    permission: 'overview.read',
    topics: ['overview-status', 'overview-priority', 'overview-services'],
    example:
      'Jika ada handoff menunggu, buka item prioritas untuk menangani pelanggan. Angka antrean menunjukkan pekerjaan yang belum selesai, bukan jumlah pelanggan yang harus dihubungi ulang.'
  },
  {
    path: '/inbox',
    title: 'Inbox',
    group: 'Ruang kerja',
    permission: 'messages.read',
    topics: ['inbox-list', 'inbox-chat', 'inbox-reply'],
    example:
      'Pelanggan meminta admin: pilih percakapannya, alihkan ke Admin, baca riwayat, lalu ketik balasan. Gunakan filter Belum dibaca untuk memeriksa pesan baru.'
  },
  {
    path: '/contacts',
    title: 'Kontak',
    group: 'Ruang kerja',
    permission: 'contacts.read',
    topics: ['contacts-list', 'contacts-create'],
    example:
      'Nama tampilan: Ibu Rina. Nomor WhatsApp: 081234567890. Simpan kontak hanya menyimpan identitas, bukan mengirim pesan.'
  },
  {
    path: '/compose',
    title: 'Tulis pesan',
    group: 'Ruang kerja',
    permission: 'messages.send',
    topics: ['compose-message'],
    example:
      'Isi nomor tujuan dan pesan konfirmasi jadwal. Kosongkan jadwal untuk pengiriman segera, atau pilih tanggal dan jam sesuai zona waktu perangkat. Jika memakai template, isi semua data pengganti, periksa pratinjau, dan penuhi checklist sebelum memasukkan ke outbox.'
  },
  {
    path: '/agents',
    title: 'Agent AI',
    group: 'AI dan knowledge',
    permission: 'chatbot.read',
    topics: ['agents-summary', 'agents-runtime'],
    example:
      'Jika ringkasan menunjukkan AI belum aktif, buka Kelola provider. Halaman ini menjelaskan konfigurasi satu asisten yang tersedia; tidak membuat banyak agent baru.'
  },
  {
    path: '/chatbot',
    title: 'Chatbot',
    group: 'AI dan knowledge',
    permission: 'chatbot.read',
    topics: ['chatbot-rules', 'chatbot-test'],
    example:
      'Trigger persis: menu. Respons: Silakan pilih layanan yang Anda perlukan. Fallback: Mohon tunggu, admin kami akan membantu. Simpan draft, coba pesan menu di panel uji, lalu Publikasikan aturan.'
  },
  {
    path: '/ai-settings',
    title: 'Integrasi AI',
    group: 'AI dan knowledge',
    permission: 'ai.settings.manage',
    topics: ['ai-saved', 'ai-connection', 'ai-model', 'ai-advanced', 'ai-activation', 'ai-active'],
    example:
      'Nama koneksi: Provider utama CS. Pilih provider yang menerbitkan API key, ambil daftar model, pilih model, lalu simpan → uji → gunakan. Untuk embedding, salin dimensi dari spesifikasi model. Jangan mengisi Base URL dengan alamat dashboard atau membagikan API key.'
  },
  {
    path: '/knowledge',
    title: 'Knowledge',
    group: 'AI dan knowledge',
    permission: 'knowledge.read',
    topics: ['knowledge-list', 'knowledge-create'],
    example:
      'Judul: Jam layanan pelanggan. Jawaban: isi jam resmi yang sudah dikonfirmasi. Varian pertanyaan: Buka jam berapa? dan Jam kerja admin kapan? ditulis pada baris terpisah. Pilih kategori yang sesuai. Simpan sebagai draft lalu lanjutkan pemeriksaan sampai published.'
  },
  {
    path: '/documents',
    title: 'Dokumen',
    group: 'AI dan knowledge',
    permission: 'knowledge.read',
    topics: ['documents-upload', 'documents-list'],
    example:
      'Unggah PDF panduan layanan yang teksnya dapat dibaca, maksimal 10 MiB. Pantau sampai pemrosesan selesai, lalu coba pertanyaan tentang isinya di Uji AI. Mengunggah file saja belum berarti file siap dicari.'
  },
  {
    path: '/ai-search',
    title: 'Uji AI',
    group: 'AI dan knowledge',
    permission: 'knowledge.read',
    topics: ['search-test', 'search-prompt', 'search-history'],
    example:
      'Coba Berapa jam layanan pelanggan?, lalu periksa jawaban dan sumbernya. Untuk instruksi AI, tulis perilaku seperti Jawab singkat dan jangan menebak; data layanan tetap disimpan di Knowledge. Pengujian tidak mengirim WhatsApp.'
  },
  {
    path: '/ai-operations',
    title: 'Review AI',
    group: 'AI dan knowledge',
    permission: 'ai.analytics.read',
    topics: ['review-answers', 'review-unanswered'],
    example:
      'Jika AI memakai informasi cabang yang salah, beri penilaian Sumber salah. Jika ada pertanyaan baru yang belum terjawab, klik Jadikan knowledge, isi jawaban resmi, simpan draft, lalu tinjau melalui Knowledge.'
  },
  {
    path: '/ai-analytics',
    title: 'Analytics AI',
    group: 'AI dan knowledge',
    permission: 'ai.analytics.read',
    topics: ['analytics-tokens', 'analytics-cost', 'analytics-quality', 'analytics-provider'],
    example:
      'Pilih 7 hari untuk melihat pemakaian selama tujuh hari terakhir. Token input adalah teks yang dikirim ke AI, output adalah teks jawabannya. Estimasi harga jual bukan tagihan resmi provider; cocokkan dengan laporan provider bila diperlukan.'
  },
  {
    path: '/ai-readiness',
    title: 'Readiness',
    group: 'AI dan knowledge',
    permission: 'ai.analytics.read',
    topics: ['readiness-cases', 'readiness-release', 'readiness-alerts'],
    example:
      'Nama kasus: Permintaan admin. Pertanyaan: Saya ingin bicara dengan admin. Target: handoff. Untuk sapaan Halo, pilih answered tanpa kewajiban sumber. Isi frasa terlarang satu per baris bila diperlukan. Jalankan semua, lalu evaluasi kesiapan dan baca penghambatnya.'
  },
  {
    path: '/session',
    title: 'Sesi WhatsApp',
    group: 'Operasional',
    permission: 'session.read',
    topics: ['session-status', 'session-controls'],
    example:
      'Pada ponsel petugas, buka WhatsApp → Perangkat tertaut → Tautkan perangkat. Pindai QR dari aplikasi. Gunakan Hubungkan ulang untuk memulihkan koneksi; Putus koneksi menghapus sesi tertaut dari aplikasi dan memerlukan penautan ulang.'
  },
  {
    path: '/templates',
    title: 'Template',
    group: 'Operasional',
    permission: 'templates.read',
    topics: ['templates-editor', 'templates-list'],
    example:
      'Nama: Konfirmasi konsultasi. Kategori: Reservasi. Isi: Halo {{nama_pelanggan}}, jadwal konsultasi Anda sudah dikonfirmasi. Centang nama_pelanggan pada Data pengganti. Checklist: Nomor benar dan Jadwal sudah dikonfirmasi, masing-masing satu baris. Publikasikan lalu aktifkan template sebelum memilihnya di Tulis pesan.'
  },
  {
    path: '/outbox',
    title: 'Riwayat pengiriman',
    group: 'Operasional',
    permission: 'messages.read',
    topics: ['outbox-status'],
    example:
      'Jika status unknown, cek WhatsApp terlebih dahulu. Isi Catatan tindakan, misalnya Pesan terlihat terkirim di WhatsApp, lalu Tandai terkirim jika buktinya sesuai. Jangan membuat pesan baru yang sama hanya karena status belum pasti.'
  },
  {
    path: '/handoffs',
    title: 'Handoff',
    group: 'Operasional',
    permission: 'handoffs.read',
    topics: ['handoffs-queue'],
    example:
      'Klik Ambil pada tugas, baca dan tangani percakapan di Inbox, lalu isi Catatan penyelesaian: Jadwal konsultasi sudah dikonfirmasi. Klik Selesaikan setelah pelanggan benar-benar ditangani.'
  },
  {
    path: '/handoff-notifications',
    title: 'Notifikasi CS',
    group: 'Operasional',
    permission: 'handoffs.read',
    topics: ['notifications-status', 'notifications-settings'],
    example:
      'Isi nomor petugas yang bertugas, bukan nomor pelanggan. Centang Aktifkan notifikasi, isi alasan Pergantian CS yang bertugas, lalu Simpan pengaturan. Handoff baru dapat mengirim ringkasan ke WhatsApp petugas tersebut.'
  },
  {
    path: '/safety',
    title: 'Keamanan',
    group: 'Operasional',
    permission: 'safety.read',
    topics: ['safety-status', 'safety-action'],
    example:
      'Jika ada pengiriman bermasalah, isi alasan lalu Jeda sekarang. Setelah diperbaiki, isi alasan baru lalu Lanjutkan. Tindakan ini memengaruhi pengiriman aplikasi, bukan hanya satu pelanggan, dan tidak menarik pesan yang sudah terkirim.'
  }
];

export const glossary = [
  ['Knowledge', 'Kumpulan informasi resmi yang menjadi bahan jawaban AI.'],
  ['Draft', 'Rancangan yang belum diterbitkan. Untuk knowledge, belum menjadi sumber aktif.'],
  ['In review / Approved', 'Sedang diperiksa / sudah disetujui; belum tentu dipublikasikan.'],
  [
    'Published / Archived',
    'Sudah diterbitkan / diarsipkan sehingga tidak dipakai sebagai sumber aktif.'
  ],
  ['Handoff', 'Pengalihan kebutuhan pelanggan kepada manusia atau CS.'],
  [
    'Fallback',
    'Jawaban cadangan atau permintaan penjelasan tambahan ketika jawaban utama belum dapat diberikan.'
  ],
  [
    'Outbox',
    'Antrean tempat pesan disimpan sebelum dikirim. Memasukkan pesan ke outbox dapat memicu pengiriman sungguhan.'
  ],
  ['Queued / Retryable / Failed', 'Menunggu dikirim / dapat dicoba ulang / gagal dikirim.'],
  [
    'Unknown / Sent',
    'Hasil pengiriman belum pasti / tercatat terkirim. Sent belum tentu berarti dibaca.'
  ],
  ['Provider / Model', 'Penyedia layanan AI / mesin AI yang dipilih untuk bekerja.'],
  [
    'API key / Base URL',
    'Kunci akses rahasia provider / alamat API provider yang dihubungi aplikasi.'
  ],
  [
    'Embedding / Retrieval',
    'Representasi teks untuk pencarian / proses mencari informasi yang relevan sebelum menjawab.'
  ],
  ['Token', 'Potongan teks yang dihitung provider sebagai pemakaian AI. Bukan saldo akun.'],
  [
    'Sitasi',
    'Rujukan sumber yang mendukung jawaban. Tetap periksa apakah sumber benar-benar mendukung klaimnya.'
  ],
  [
    'Revisi / Versi',
    'Nomor perubahan pengaturan / nomor perubahan isi yang disimpan dalam riwayat.'
  ],
  [
    'Pilot / Readiness',
    'Penggunaan awal secara terbatas / penilaian kesiapan berdasarkan syarat dan bukti pengujian.'
  ],
  [
    'p50 / p95 / ms',
    'Sekitar 50% / 95% respons selesai dalam waktu tersebut. ms berarti milidetik.'
  ]
];

export const troubleshooting = [
  [
    'Pesan tidak terkirim',
    'Periksa Sesi WhatsApp, status pengiriman di Keamanan, lalu detail pesan di Riwayat. Jika failed, tangani penyebabnya sebelum Coba lagi. Jika unknown, pastikan hasilnya di WhatsApp sebelum memperbarui status.'
  ],
  [
    'AI tidak membalas',
    'Periksa apakah percakapan berada dalam mode Admin, koneksi chat sudah aktif, serta layanan WhatsApp tersambung. Gunakan Uji AI untuk membedakan masalah jawaban dengan masalah pengiriman.'
  ],
  [
    'Jawaban salah atau tidak lengkap',
    'Periksa sumber di Uji AI, catat masalah di Review AI, lalu perbarui atau tambahkan Knowledge melalui pemeriksaan dan publikasi. Jangan menambah fakta hanya melalui instruksi AI.'
  ],
  [
    'Knowledge baru belum dipakai',
    'Pastikan statusnya published. Untuk dokumen, tunggu pemrosesan selesai. Uji kembali dengan pertanyaan yang jawabannya jelas terdapat dalam sumber.'
  ],
  [
    'Model tidak dapat diaktifkan',
    'Pastikan API key tersimpan, model tersedia untuk akun provider, dan uji model berhasil. Setelah mengganti key atau model, lakukan pengujian ulang.'
  ],
  [
    'Notifikasi CS belum diterima',
    'Periksa nomor penerima dan status aktif, pastikan ada handoff baru dari AI, lalu periksa status pengiriman notifikasinya di Riwayat.'
  ],
  [
    'Tombol tidak dapat diklik atau menu tidak muncul',
    'Sebagian tindakan membutuhkan izin pengelola, data wajib, atau pengujian yang berhasil. Baca petunjuk di kolom dan status halaman. Buku panduan dapat dibaca semua pengguna yang sudah masuk; akses tindakan tetap mengikuti izin akun.'
  ],
  [
    'Lupa password atau tidak dapat masuk',
    'Gunakan username dan password dari pengelola. Jika lupa atau akun belum tersedia, hubungi pengelola aplikasi. Jangan mengirim password atau API key ke pelanggan.'
  ]
];
