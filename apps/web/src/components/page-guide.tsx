import Link from 'next/link';

type Guide = { purpose: string; steps: string[]; note: string };

export const pageGuides: Record<string, Guide> = {
  '/overview': {
    purpose: 'Mulai dari sini untuk memantau operasional harian.',
    steps: [
      'Periksa koneksi WhatsApp dan indikator layanan.',
      'Buka Inbox untuk percakapan baru dan Handoff untuk pelanggan yang menunggu CS.'
    ],
    note: 'Jika data belum tampil, periksa koneksi layanan sebelum mengaktifkan balasan otomatis.'
  },
  '/inbox': {
    purpose: 'Baca percakapan pelanggan dan tentukan siapa yang membalas.',
    steps: [
      'Pilih percakapan dan baca riwayat sebelum menjawab.',
      'Gunakan mode admin saat CS menangani pelanggan; periksa mode percakapan sebelum mengirim balasan.'
    ],
    note: 'Pesan yang dikirim dari Inbox diterima pelanggan melalui WhatsApp.'
  },
  '/contacts': {
    purpose: 'Kelola identitas dan informasi kontak pelanggan.',
    steps: [
      'Cari pelanggan berdasarkan informasi yang tersedia.',
      'Periksa nomor dan detail kontak sebelum menyimpan perubahan atau memulai percakapan.'
    ],
    note: 'Gunakan informasi pelanggan hanya untuk kebutuhan pelayanan.'
  },
  '/compose': {
    purpose: 'Kirim pesan baru kepada pelanggan.',
    steps: [
      'Pilih penerima dan tulis pesan atau gunakan template.',
      'Periksa nomor serta isi pesan, kirim, lalu pantau statusnya di Riwayat.'
    ],
    note: 'Tombol kirim mengirim pesan WhatsApp sungguhan.'
  },
  '/agents': {
    purpose: 'Lihat susunan dan peran agent AI yang tersedia.',
    steps: [
      'Tinjau peran agent dan koneksi AI yang digunakan.',
      'Atur provider di Integrasi AI dan periksa jawaban melalui Uji AI.'
    ],
    note: 'Knowledge yang belum tersedia tetap perlu dilengkapi sebelum jawaban faktual dapat dinilai.'
  },
  '/chatbot': {
    purpose: 'Atur aturan balasan dan routing chatbot.',
    steps: [
      'Isi aturan dan simpan perubahan sebagai draft.',
      'Gunakan uji routing, periksa hasilnya, lalu publikasikan saat aturan sudah sesuai.'
    ],
    note: 'Uji routing tidak mengirim WhatsApp; aturan yang dipublikasikan dapat memengaruhi percakapan pelanggan.'
  },
  '/ai-settings': {
    purpose: 'Hubungkan provider untuk menghasilkan jawaban dan mencari dokumen.',
    steps: [
      'Tambahkan koneksi chat atau embedding dan isi konfigurasi provider.',
      'Simpan, jalankan uji koneksi, lalu aktifkan koneksi yang berhasil diuji.'
    ],
    note: 'Chat menghasilkan jawaban; embedding membantu pencarian semantik. Jangan bagikan API key.'
  },
  '/knowledge': {
    purpose: 'Kelola informasi resmi yang boleh digunakan AI.',
    steps: [
      'Tambahkan atau perbarui informasi dan variasi pertanyaannya.',
      'Tinjau isinya, publikasikan, lalu periksa hasilnya di Uji AI.'
    ],
    note: 'Sambil menunggu knowledge lengkap, uji sapaan, batas kemampuan, dan handoff; jangan mengisi fakta perkiraan.'
  },
  '/documents': {
    purpose: 'Tambahkan dokumen sebagai bahan pencarian AI.',
    steps: [
      'Unggah dokumen yang sudah ditinjau dan pantau status pemrosesan.',
      'Setelah siap, uji pertanyaan yang jawabannya ada di dokumen melalui Uji AI.'
    ],
    note: 'Dokumen yang masih diproses atau gagal belum siap dipakai untuk pencarian.'
  },
  '/ai-search': {
    purpose: 'Coba jawaban AI sebelum digunakan dalam percakapan pelanggan.',
    steps: [
      'Masukkan pertanyaan, jalankan uji, lalu baca jawaban dan sumber pendukungnya.',
      'Coba typo dan pertanyaan di luar informasi tersedia; tinjau hasil di Review AI.'
    ],
    note: 'Pengujian tidak mengirim WhatsApp. Publikasi instruksi mengubah aturan jawaban AI.'
  },
  '/ai-operations': {
    purpose: 'Tinjau jawaban AI dan catat koreksi admin.',
    steps: [
      'Pilih hasil jawaban dan periksa sumber serta alasan fallback atau handoff.',
      'Berikan penilaian dan catatan spesifik; gunakan temuan untuk revisi knowledge dan kasus uji.'
    ],
    note: 'Feedback adalah bahan review; jangan menganggap catatan otomatis menjadi knowledge yang dipublikasikan.'
  },
  '/ai-analytics': {
    purpose: 'Pantau kualitas jawaban dan pola masalah AI.',
    steps: [
      'Tinjau jumlah jawaban, fallback, handoff, serta waktu respons.',
      'Telusuri kasus bermasalah di Review AI sebelum mengubah konfigurasi.'
    ],
    note: 'Jumlah jawaban tinggi belum membuktikan jawaban benar; tetap periksa contoh percakapannya.'
  },
  '/ai-readiness': {
    purpose: 'Simpan skenario pengujian dan periksa kesiapan AI.',
    steps: [
      'Tambahkan pertanyaan beserta hasil yang diharapkan: jawaban, klarifikasi, atau handoff.',
      'Jalankan semua kasus, tinjau hasilnya, lalu evaluasi kesiapan dan selesaikan penghambat yang muncul.'
    ],
    note: 'Pengujian tidak mengirim WhatsApp. Skenario sapaan dan handoff bisa disiapkan sebelum knowledge lengkap.'
  },
  '/session': {
    purpose: 'Hubungkan dan pantau akun WhatsApp operasional.',
    steps: [
      'Tampilkan QR saat sesi belum tersambung.',
      'Pindai melalui menu Perangkat tertaut di WhatsApp, lalu tunggu status terhubung.'
    ],
    note: 'Jika sesi terputus, periksa akun WhatsApp dan koneksi sebelum mencoba menghubungkan ulang.'
  },
  '/templates': {
    purpose: 'Siapkan teks pesan yang sering dipakai CS.',
    steps: [
      'Buat atau pilih template dan periksa isi serta variabelnya.',
      'Simpan template, lalu lengkapi data pelanggan sebelum digunakan untuk mengirim pesan.'
    ],
    note: 'Menyimpan template tidak sama dengan mengirim pesan kepada pelanggan.'
  },
  '/outbox': {
    purpose: 'Lacak status pengiriman pesan WhatsApp.',
    steps: [
      'Cari pesan dan periksa status serta detail kegagalannya.',
      'Jika tersedia, gunakan coba ulang setelah penyebab kegagalan ditangani.'
    ],
    note: 'Periksa status terlebih dahulu sebelum membuat pesan baru dengan isi yang sama.'
  },
  '/handoffs': {
    purpose: 'Tangani percakapan yang membutuhkan bantuan manusia.',
    steps: [
      'Buka antrean dan baca riwayat pelanggan di Inbox.',
      'Tetapkan penanggung jawab, tangani kebutuhan pelanggan, lalu tandai selesai setelah benar-benar ditangani.'
    ],
    note: 'Menyelesaikan antrean bukan pengganti membalas pelanggan.'
  },
  '/handoff-notifications': {
    purpose: 'Atur penerima pemberitahuan saat pelanggan perlu CS.',
    steps: [
      'Isi nomor WhatsApp CS yang bertugas dan periksa formatnya.',
      'Pilih status aktif, isi alasan perubahan, lalu simpan pengaturan.'
    ],
    note: 'Saat aktif, notifikasi handoff dikirim ke nomor CS yang dikonfigurasi. Pastikan nomor tersebut benar.'
  },
  '/safety': {
    purpose: 'Periksa kontrol keamanan dan tindakan pemulihan operasional.',
    steps: [
      'Baca status serta dampak tindakan yang tersedia.',
      'Isi alasan yang jelas sebelum menjalankan perubahan atau pemulihan.'
    ],
    note: 'Periksa cakupan setiap tindakan, terutama reset, sebelum menjalankannya.'
  }
};

export function PageGuide({ pathname }: { pathname: string }) {
  const guide = pageGuides[pathname];
  if (!guide) return null;
  return (
    <aside className="page-guide-compact" aria-label="Petunjuk penggunaan">
      <p>{guide.purpose}</p>
      <Link href={`/guidebook#fitur-${pathname.slice(1)}`}>Baca panduan</Link>
    </aside>
  );
}
