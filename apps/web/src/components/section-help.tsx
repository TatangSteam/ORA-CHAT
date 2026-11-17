import type { ReactNode } from 'react';

type Help = { purpose: string; how: string; terms?: Record<string, string> };

export const sectionHelp = {
  'overview-status': {
    purpose: 'Menunjukkan apakah layanan dan pengiriman pesan sedang berjalan normal.',
    how: 'Mulai dengan membaca status. Klik Perbarui untuk mengambil kondisi terbaru; tombol ini tidak mengirim pesan.',
    terms: {
      Pengiriman: 'Aktif berarti antrean boleh diproses; Dijeda berarti pengiriman ditahan.',
      'Kill switch':
        'Pengaman darurat. Jika aktif, periksa halaman Keamanan dan hubungi pengelola.',
      'Level risiko': 'Indikator kondisi operasional, bukan penilaian kondisi kesehatan pelanggan.',
      'Waktu pembaruan':
        'Menunjukkan kapan data terakhir diperiksa. Pembaruan berkala berarti aplikasi memeriksa ulang secara otomatis.'
    }
  },
  'overview-priority': {
    purpose: 'Mengumpulkan pekerjaan operator yang perlu segera ditangani.',
    how: 'Klik item untuk membuka halaman terkait, lalu tangani masalahnya di sana. Tidak ada item berarti tidak ada prioritas yang terdeteksi saat ini.'
  },
  'overview-services': {
    purpose: 'Memeriksa koneksi aplikasi ke layanan pendukung.',
    how: 'Sehat berarti layanan merespons. Belum dikonfigurasi berarti belum disiapkan. Jika bermasalah, minta pengelola memeriksa layanan tersebut; angka ms adalah lama responsnya.'
  },
  'agents-summary': {
    purpose: 'Menjelaskan bagian-bagian yang membentuk satu asisten WhatsApp untuk organisasi ini.',
    how: 'Gunakan tautan Kelola pada kartu untuk membuka pengaturannya. Halaman ringkasan ini tidak membuat agent baru.',
    terms: {
      'Aturan chatbot': 'Balasan tetap untuk kata atau pesan tertentu.',
      'AI chat': 'Provider dan model yang menyusun jawaban.',
      Knowledge: 'Informasi resmi yang menjadi bahan jawaban AI.',
      'Keamanan dan pengujian':
        'Kontrol pengiriman dan tempat mencoba jawaban sebelum melayani pelanggan.'
    }
  },
  'agents-runtime': {
    purpose: 'Memperlihatkan konfigurasi yang saat ini digunakan asisten.',
    how: 'Baca urutan aturan, model AI, sumber jawaban, dan pengamanan. Untuk mengganti salah satunya, buka halaman pengaturan terkait; bagian ini hanya untuk melihat.'
  },
  'inbox-list': {
    purpose: 'Memilih percakapan pelanggan yang akan dibaca atau ditangani.',
    how: 'Cari nama atau nomor, gunakan filter, lalu klik percakapan. Filter hanya mengubah daftar yang terlihat.',
    terms: {
      Prioritas:
        'Belum dibaca untuk pesan baru, Handoff untuk yang perlu CS, dan Follow-up untuk yang perlu tindak lanjut.',
      'Mode penanganan': 'AI aktif berarti bot membalas; Admin aktif berarti manusia menangani.',
      'Angka pada percakapan': 'Jumlah pesan yang belum dibaca.'
    }
  },
  'inbox-chat': {
    purpose: 'Membaca riwayat pesan dan menentukan siapa yang membalas pelanggan ini.',
    how: 'Baca pesan terbaru, lalu periksa sakelar AI. Matikan AI saat mengambil alih sebagai admin; aktifkan kembali saat percakapan siap ditangani bot.',
    terms: {
      'AI / Admin aktif': 'Perubahan sakelar berlaku pada percakapan yang sedang dipilih.',
      'Status unknown': 'Pengiriman belum dapat dipastikan. Periksa Riwayat sebelum mengirim ulang.'
    }
  },
  'inbox-reply': {
    purpose: 'Menulis balasan admin kepada pelanggan yang dipilih.',
    how: 'Ketik pesan, periksa penerima dan isinya, lalu klik Kirim lewat outbox. Pesan masuk antrean untuk dikirim ke WhatsApp sungguhan.'
  },
  'contacts-list': {
    purpose: 'Menemukan kontak yang sudah tersimpan.',
    how: 'Ketik sebagian nama atau nomor untuk mempersempit daftar. Nomor di daftar disamarkan untuk melindungi data pelanggan.',
    terms: {
      'Opted out':
        'Kontak sudah memilih berhenti menerima pesan; jangan gunakan kontak ini untuk pengiriman yang tidak diinginkan.'
    }
  },
  'contacts-create': {
    purpose: 'Menyimpan identitas pelanggan agar mudah ditemukan saat pelayanan.',
    how: 'Isi nomor WhatsApp aktif dan nama bila diketahui, lalu klik Simpan kontak. Menyimpan kontak tidak mengirim pesan.'
  },
  'compose-message': {
    purpose: 'Menyiapkan pesan WhatsApp baru untuk satu penerima.',
    how: 'Isi penerima, pilih template atau tulis pesan sendiri, lalu periksa jadwal. Klik Masukkan ke outbox untuk menyimpan ke antrean pengiriman.',
    terms: {
      'Template internal':
        'Teks siap pakai milik aplikasi. Isi data penggantinya dan lihat pratinjau sebelum mengirim.',
      Checklist: 'Centang setelah pemeriksaan benar-benar dilakukan. Item wajib harus dipenuhi.',
      'Lihat pratinjau': 'Menampilkan isi template setelah data diisi; belum mengirim pesan.',
      'Masukkan ke outbox': 'Mengantrekan pengiriman sungguhan. Pantau hasil di halaman Riwayat.'
    }
  },
  'chatbot-rules': {
    purpose: 'Membuat balasan tetap saat pesan pelanggan cocok dengan pemicu.',
    how: 'Isi kata pemicu dan balasannya, simpan draft, uji di panel sebelah, lalu publikasikan jika hasilnya sesuai.',
    terms: {
      'Simpan draft': 'Menyimpan rancangan tanpa langsung mengaktifkannya.',
      'Publikasikan aturan':
        'Mengaktifkan satu versi aturan secara utuh untuk percakapan berikutnya.',
      Fallback: 'Pesan cadangan jika tidak ada aturan yang cocok.'
    }
  },
  'chatbot-test': {
    purpose: 'Mengecek aturan mana yang cocok dengan contoh pesan.',
    how: 'Simpan draft lebih dahulu, ketik contoh pesan, lalu jalankan uji. Rule cocok berarti pemicu ditemukan; Fallback berarti memakai balasan cadangan. Uji ini tidak mengirim WhatsApp.'
  },
  'knowledge-list': {
    purpose: 'Melihat informasi resmi dan tahap persetujuan setiap jawaban.',
    how: 'Baca jawaban lewat Lihat selengkapnya, lalu gunakan tombol tahap berikutnya setelah pemeriksaan selesai.',
    terms: {
      'Draft → In review': 'Rancangan diajukan untuk diperiksa.',
      'Approved → Published':
        'Jawaban yang disetujui dipublikasikan agar dapat dipakai sebagai sumber AI.',
      Archived: 'Diarsipkan dan tidak digunakan sebagai sumber aktif.',
      Versi: 'Nomor perubahan isi. Riwayat versi menyimpan isi sebelumnya.'
    }
  },
  'knowledge-create': {
    purpose: 'Menambahkan satu topik tanya-jawab sebagai bahan jawaban AI.',
    how: 'Isi judul, kategori, jawaban yang sudah dipastikan, dan contoh pertanyaan pelanggan. Simpan draft, lalu lanjutkan tahap pemeriksaan pada daftar knowledge. Draft belum menjadi sumber aktif.'
  },
  'documents-upload': {
    purpose: 'Memasukkan dokumen resmi agar isinya dapat diproses sebagai sumber jawaban.',
    how: 'Pilih satu PDF, DOCX, atau TXT maksimal 10 MiB, lalu klik Unggah dokumen. Tunggu pemrosesan selesai sebelum menguji isinya di Uji AI.'
  },
  'documents-list': {
    purpose: 'Memantau pemrosesan dan mengelola dokumen yang sudah diunggah.',
    how: 'Periksa status dan pesan kegagalan. Gunakan Unduh untuk membaca file, Coba lagi setelah masalah diperbaiki, atau Arsipkan jika sumber tidak berlaku.',
    terms: {
      Diproses: 'File sedang dibaca atau disiapkan untuk pencarian; belum tentu siap dipakai AI.',
      Failed: 'Pemrosesan gagal; baca kode penyebab sebelum mencoba lagi.',
      Arsipkan: 'Menghentikan penggunaan dokumen sebagai sumber aktif.'
    }
  },
  'search-test': {
    purpose: 'Mencoba jawaban AI dan memeriksa bukti pendukungnya.',
    how: 'Ketik pertanyaan seperti pelanggan, klik Uji jawaban, lalu bandingkan jawaban dengan cuplikan sumber. Tidak ada WhatsApp yang dikirim.',
    terms: {
      Answered: 'AI menghasilkan jawaban.',
      Fallback: 'AI meminta penjelasan tambahan atau memakai respons cadangan.',
      Handoff: 'Pertanyaan perlu bantuan CS.',
      'Sitasi / sumber':
        'Bahan yang dirujuk jawaban. Periksa isinya; adanya sitasi belum menjamin semua klaim benar.'
    }
  },
  'search-prompt': {
    purpose: 'Mengatur cara AI menggunakan informasi untuk menyusun jawaban.',
    how: 'Tulis instruksi perilaku, bukan data layanan seperti harga atau alamat. Klik Publikasikan instruksi untuk memberlakukannya, lalu ulangi pengujian. Fakta layanan ditambahkan di Knowledge.'
  },
  'search-history': {
    purpose: 'Membaca kembali hasil uji dan jawaban yang tercatat.',
    how: 'Bandingkan status, isi jawaban, waktu respons, dan jumlah sumber. Gunakan Review AI untuk memberi penilaian terhadap jawaban bermasalah.'
  },
  'review-answers': {
    purpose: 'Mencatat apakah jawaban AI sudah sesuai untuk pelanggan.',
    how: 'Baca jawaban sebelum menilai. Benar untuk jawaban sesuai, Sumber salah jika bahan acuannya tidak cocok, dan Tidak aman untuk jawaban berisiko. Penilaian tidak otomatis mengubah knowledge.'
  },
  'review-unanswered': {
    purpose: 'Mengumpulkan pertanyaan yang belum berhasil dijawab agar knowledge dapat dilengkapi.',
    how: 'Lihat pertanyaan dan frekuensinya. Klik Jadikan knowledge, isi jawaban yang sudah diverifikasi, lalu Simpan draft. Lanjutkan pemeriksaan dan publikasi di halaman Knowledge.'
  },
  'readiness-cases': {
    purpose: 'Menyimpan contoh pertanyaan untuk memeriksa perilaku AI secara berulang.',
    how: 'Beri nama kasus, isi pertanyaan, tentukan hasil yang diharapkan, lalu simpan. Klik Jalankan semua untuk menguji seluruh kasus tanpa mengirim WhatsApp.',
    terms: {
      'Wajib menyertakan sumber':
        'Aktifkan untuk jawaban faktual. Matikan untuk sapaan; klarifikasi dan handoff tidak memerlukan sumber.',
      'Passed / Failed':
        'Lulus atau gagal terhadap syarat kasus, bukan bukti bahwa semua fakta sudah benar.',
      'Batas waktu': 'Kasus uji pada halaman ini menggunakan batas respons 30 detik.'
    }
  },
  'readiness-release': {
    purpose: 'Memeriksa apakah bukti pengujian dan konfigurasi memenuhi syarat penggunaan AI.',
    how: 'Jalankan kasus uji terlebih dahulu, lalu klik Evaluasi kesiapan. Baca daftar penghambat dan perbaiki bagian terkait. Evaluasi ini tidak otomatis mengaktifkan pilot.',
    terms: {
      Pilot: 'Persentase penggunaan terbatas yang tercatat pada hasil evaluasi.',
      'Perlu diselesaikan':
        'Syarat yang belum terpenuhi; jangan menganggap sistem siap hanya karena evaluasi selesai.'
    }
  },
  'readiness-alerts': {
    purpose: 'Menampilkan masalah operasional AI yang perlu perhatian.',
    how: 'Baca ringkasan, tingkat keparahan, dan status. Periksa koneksi di Integrasi AI atau kualitas jawaban di Review AI sesuai masalahnya.'
  },
  'analytics-tokens': {
    purpose: 'Menunjukkan banyaknya teks yang diproses provider AI pada periode pilihan.',
    how: 'Pilih 1, 7, 30, atau 90 hari untuk mengganti periode. Angka ini adalah pemakaian tercatat, bukan saldo akun provider.',
    terms: {
      Input: 'Token dari pertanyaan, instruksi, dan konteks yang dikirim ke AI.',
      Output: 'Token dari jawaban yang dihasilkan AI.',
      Cached: 'Token yang dilaporkan provider sebagai penggunaan cache.',
      'Kelengkapan data usage':
        'Persentase permintaan yang melaporkan pemakaian; angka rendah berarti laporan belum lengkap.'
    }
  },
  'analytics-cost': {
    purpose:
      'Memberi estimasi harga jual berdasarkan pemakaian token dan tarif yang ditetapkan aplikasi.',
    how: 'Baca periode, tarif input/output, dan totalnya. Cocokkan dengan laporan provider bila diperlukan; angka ini bukan bukti pembayaran atau saldo.'
  },
  'analytics-quality': {
    purpose: 'Membantu membaca indikator kualitas, kecepatan, dan antrean AI.',
    how: 'Bandingkan indikator dengan contoh di Review AI. Persentase terjawab tinggi belum menjamin jawaban benar.',
    terms: {
      'Didukung sumber': 'Jawaban memiliki dukungan sumber yang tercatat.',
      Handoff: 'Jawaban yang perlu ditangani manusia.',
      'p50 / p95': 'Sekitar 50% / 95% respons selesai dalam waktu tersebut; ms adalah milidetik.',
      'Waktu antrean': 'Lama permintaan tertua menunggu untuk diproses.'
    }
  },
  'analytics-provider': {
    purpose: 'Menemukan provider yang lambat atau sering gagal menjawab.',
    how: 'Bandingkan jumlah permintaan, kesalahan, dan rata-rata waktu respons. Jika bermasalah, periksa koneksinya melalui Integrasi AI.'
  },
  'session-status': {
    purpose: 'Memastikan akun WhatsApp sudah tersambung ke aplikasi.',
    how: 'Klik Tampilkan QR, lalu di ponsel buka WhatsApp → Perangkat tertaut → Tautkan perangkat dan pindai QR. Tunggu status Terhubung. Jika QR kedaluwarsa, tampilkan yang baru.',
    terms: {
      'Pembaruan terakhir': 'Waktu laporan koneksi terbaru, bukan waktu pesan terakhir.',
      'Terhubung sejak': 'Waktu sesi aktif mulai tersambung.'
    }
  },
  'session-controls': {
    purpose: 'Memulihkan atau menghentikan koneksi akun WhatsApp.',
    how: 'Gunakan Hubungkan ulang jika koneksi bermasalah. Putus koneksi mengeluarkan sesi dari aplikasi; setelahnya akun perlu ditautkan lagi dengan QR. Pesan tidak dapat dikirim saat akun terputus.'
  },
  'templates-editor': {
    purpose: 'Membuat teks siap pakai agar CS tidak mengetik pesan yang sama berulang kali.',
    how: 'Isi nama, kategori, dan isi template. Pilih data pengganti yang digunakan, tambahkan checklist bila perlu, lalu buat draft. Publikasikan dan aktifkan lewat daftar template sebelum dipakai di Tulis pesan.',
    terms: {
      'Data pengganti':
        'Daftar data yang boleh diganti, misalnya nama pelanggan. Penulisannya di isi pesan menggunakan dua kurung kurawal, misalnya {{nama_pelanggan}}.',
      'Checklist wajib': 'Pemeriksaan yang harus dicentang CS sebelum pesan dikirim.',
      'Buat draft versi': 'Membuat perubahan baru sambil menyimpan riwayat versi lama.'
    }
  },
  'templates-list': {
    purpose: 'Mengelola template yang boleh dipakai untuk menulis pesan.',
    how: 'Pilih Edit versi untuk mengubah teks, Publish untuk menerbitkan draft, lalu Aktifkan agar tersedia di Tulis pesan.',
    terms: {
      Nonaktifkan: 'Menyembunyikan template dari pemilihan pengiriman tanpa menghapus riwayat.',
      Duplikat: 'Membuat salinan terpisah sebagai awal template baru.',
      Arsipkan: 'Menghentikan penggunaan template; gunakan dengan hati-hati.',
      Histori: 'Daftar versi beserta tahap publikasinya.'
    }
  },
  'outbox-status': {
    purpose: 'Melacak pesan yang sudah dimasukkan ke antrean pengiriman.',
    how: 'Cari pesan dan baca statusnya sebelum memilih tindakan. Isi Catatan tindakan untuk menjelaskan alasan perubahan.',
    terms: {
      'Queued / Retryable':
        'Menunggu dikirim atau dapat dicoba ulang. Batalkan menghentikan pengiriman yang masih dapat dibatalkan.',
      'Failed / Coba lagi': 'Pengiriman gagal; perbaiki penyebabnya sebelum mengantrekan ulang.',
      Unknown:
        'Hasil belum dapat dipastikan. Cek bukti di WhatsApp sebelum memilih Tandai terkirim atau Tandai gagal.',
      Sent: 'Pesan tercatat terkirim; tidak selalu berarti sudah dibaca pelanggan.'
    }
  },
  'handoffs-queue': {
    purpose: 'Membagi pekerjaan untuk percakapan yang perlu bantuan CS.',
    how: 'Klik Ambil untuk menetapkan diri sebagai penanggung jawab, baca dan balas pelanggan di Inbox, isi Catatan penyelesaian, lalu klik Selesaikan setelah kebutuhan ditangani.',
    terms: {
      Ambil: 'Menetapkan admin yang sedang masuk sebagai penanggung jawab.',
      Selesai: 'Menutup tugas handoff dan menyimpan catatan; tidak mengirim balasan ke pelanggan.'
    }
  },
  'notifications-status': {
    purpose: 'Menunjukkan apakah pemberitahuan handoff ke CS sedang diaktifkan.',
    how: 'Periksa nomor penerima dan waktu perubahan terakhir. Aktif berarti handoff baru dari AI dapat memicu ringkasan ke WhatsApp CS; nonaktif berarti pemberitahuan ini dimatikan.',
    terms: { Revision: 'Nomor perubahan pengaturan, bukan jumlah notifikasi yang dikirim.' }
  },
  'notifications-settings': {
    purpose: 'Menentukan petugas CS yang menerima pemberitahuan saat AI memerlukan manusia.',
    how: 'Isi nomor petugas, centang aktivasi jika ingin menerima notifikasi, tulis alasan, lalu Simpan pengaturan. Berlaku langsung untuk handoff baru; tidak mengirim ulang semua handoff lama.'
  },
  'safety-status': {
    purpose: 'Memastikan apakah aplikasi sedang mengizinkan pengiriman pesan.',
    how: 'Baca status, risiko, dan alasan terakhir sebelum mengubah pengiriman.',
    terms: {
      Revisi: 'Nomor perubahan pengaturan untuk mencegah perubahan admin saling menimpa.',
      'Alasan terakhir': 'Catatan dari tindakan jeda atau lanjutkan yang terakhir tersimpan.'
    }
  },
  'safety-action': {
    purpose:
      'Menahan pengiriman sementara saat ada masalah, lalu melanjutkannya setelah diperbaiki.',
    how: 'Isi alasan yang jelas dan klik Jeda sekarang atau Lanjutkan. Tindakan ini memengaruhi pengiriman aplikasi, bukan hanya satu percakapan. Pesan yang sudah terkirim tidak dapat ditarik kembali dengan tombol ini.'
  },
  'ai-connection': {
    purpose: 'Menghubungkan aplikasi dengan penyedia layanan AI.',
    how: 'Beri nama yang mudah dikenali, pilih provider, lalu masukkan API key dari akun provider. Untuk layanan yang meminta Base URL, gunakan alamat API dari pengelola provider, bukan alamat dashboard.'
  },
  'ai-model': {
    purpose: 'Memilih mesin AI yang digunakan koneksi ini.',
    how: 'Klik Ambil daftar model, cari model yang tersedia untuk akunmu, lalu pilih. Mode manual hanya digunakan jika sudah mengetahui ID model persis dari provider.',
    terms: {
      Chat: 'Menghasilkan balasan pelanggan.',
      Embedding: 'Mengubah teks menjadi data pencarian untuk menemukan sumber yang relevan.',
      'Dimensi embedding':
        'Jumlah komponen keluaran model; harus sesuai spesifikasi model dan indeks dokumen. Jangan menebak nilainya.'
    }
  },
  'ai-advanced': {
    purpose: 'Mengatur batas teknis permintaan AI bila pengaturan standar perlu disesuaikan.',
    how: 'Biarkan nilai awal jika belum yakin. Timeout adalah lama menunggu jawaban; batas token output membatasi panjang keluaran. Nilai terlalu kecil dapat menyebabkan gagal atau jawaban terpotong.'
  },
  'ai-activation': {
    purpose: 'Memastikan koneksi dapat dipakai sebelum mengganti model yang aktif.',
    how: 'Simpan koneksi, klik Uji model, lalu Gunakan model ini setelah pengujian berhasil. Menyimpan atau menguji saja belum mengganti koneksi aktif. Mengganti API key atau model memerlukan pengujian ulang.'
  },
  'ai-saved': {
    purpose: 'Memilih koneksi tersimpan yang ingin diperiksa atau digunakan.',
    how: 'Pilih tab Chat atau Embedding, lalu pilih kartu koneksi. Klik tambah koneksi untuk membuat konfigurasi baru. Kartu terpilih belum tentu koneksi yang sedang aktif.'
  },
  'ai-active': {
    purpose: 'Menunjukkan model yang saat ini dipakai untuk tujuan yang dipilih.',
    how: 'Periksa nama provider dan model. Menonaktifkan koneksi menghentikan pemakaiannya; tidak menghapus konfigurasi atau API key yang tersimpan.'
  }
} satisfies Record<string, Help>;

export function SectionHelp({
  topic,
  expanded = false
}: {
  topic: keyof typeof sectionHelp;
  expanded?: boolean;
}) {
  const content: Help = sectionHelp[topic];
  const explanation = (
    <div className="section-help" aria-label="Penjelasan bagian">
      <p>
        <strong>Fungsi: </strong>
        {content.purpose}
      </p>
      <p>
        <strong>Cara pakai: </strong>
        {content.how}
      </p>
      {content.terms && (
        <dl>
          {Object.entries(content.terms).map(([term, explanation]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{explanation}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
  if (expanded) return explanation;
  return (
    <details className="section-help-disclosure">
      <summary>Panduan bagian ini</summary>
      {explanation}
    </details>
  );
}

export function FieldHelp({ id, children }: { id: string; children: ReactNode }) {
  return (
    <small className="field-help" id={id}>
      {children}
    </small>
  );
}
