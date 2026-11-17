'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Shell } from '../../components/shell';
import { pageGuides } from '../../components/page-guide';
import { SectionHelp, sectionHelp } from '../../components/section-help';
import { useSession } from '../../components/use-session';
import { features, glossary, troubleshooting } from './features';

const normalize = (value: string) =>
  value.normalize('NFKC').toLocaleLowerCase('id-ID').replace(/\s+/gu, ' ').trim();

export default function GuidebookPage() {
  const [search, setSearch] = useState('');
  const { user } = useSession();
  const query = normalize(search);
  const matches = (text: string) => !query || normalize(text).includes(query);
  const shownFeatures = features.filter((feature) =>
    matches(
      [
        feature.title,
        feature.group,
        feature.example,
        JSON.stringify(pageGuides[feature.path]),
        ...feature.topics.map((topic) => JSON.stringify(sectionHelp[topic]))
      ].join(' ')
    )
  );
  const shownGlossary = glossary.filter((entry) => matches(entry.join(' ')));
  const shownTroubleshooting = troubleshooting.filter((entry) => matches(entry.join(' ')));
  const hasResults = shownFeatures.length + shownGlossary.length + shownTroubleshooting.length > 0;

  return (
    <Shell eyebrow="Pusat bantuan" title="Buku Panduan">
      <div className="guidebook">
        <section className="section-card guidebook-intro" aria-labelledby="guidebook-title">
          <p className="eyebrow">Panduan lengkap dalam satu halaman</p>
          <h2 id="guidebook-title">Kenali fitur, ikuti langkahnya, pahami hasilnya</h2>
          <p>
            Gunakan buku ini untuk belajar mengoperasikan RAHO Control Room dari awal. Semua{' '}
            {features.length} fitur utama dijelaskan dengan fungsi, cara pakai, contoh, dan dampak
            tindakan.
          </p>
          <p>
            Gunakan daftar isi untuk melompat ke bagian yang diperlukan. Penjelasan fitur tetap bisa
            dibaca walaupun akunmu tidak memiliki izin untuk menjalankan tindakannya.
          </p>
          <label htmlFor="guidebook-search">Cari fitur, istilah, atau kendala</label>
          <input
            id="guidebook-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Contoh: kirim pesan, API key, handoff, password"
            aria-describedby="guidebook-search-help"
          />
          <small className="field-help" id="guidebook-search-help">
            Hasil disaring otomatis. Kosongkan pencarian untuk membaca buku lengkap.
          </small>
          {query && (
            <p className="guidebook-results" role="status">
              Ditemukan {shownFeatures.length} fitur, {shownGlossary.length} istilah, dan{' '}
              {shownTroubleshooting.length} solusi.
            </p>
          )}
        </section>

        <div className="guidebook-layout">
          <nav className="guidebook-toc" aria-label="Daftar isi buku panduan">
            <h2>Daftar isi</h2>
            {!query && (
              <>
                <a href="#mulai">Mulai dari sini</a>
                <a href="#persiapan">Persiapan pertama kali</a>
                <a href="#alur-harian">Alur kerja sehari-hari</a>
              </>
            )}
            {shownFeatures.map((feature) => (
              <a key={feature.path} href={`#fitur-${feature.path.slice(1)}`}>
                {feature.title}
              </a>
            ))}
            {shownGlossary.length > 0 && <a href="#istilah">Arti istilah dan status</a>}
            {shownTroubleshooting.length > 0 && <a href="#kendala">Mengatasi kendala</a>}
          </nav>

          <div className="guidebook-body">
            {!query && (
              <>
                <section
                  className="section-card guidebook-chapter"
                  id="mulai"
                  aria-labelledby="mulai-title"
                >
                  <h2 id="mulai-title">Mulai dari sini</h2>
                  <p>
                    Aplikasi ini membantu tim melayani pelanggan melalui WhatsApp. AI menjawab
                    menggunakan informasi resmi, sedangkan admin mengambil alih saat pelanggan
                    membutuhkan bantuan manusia.
                  </p>
                  <ol>
                    <li>
                      <strong>Masuk:</strong> gunakan username dan password dari pengelola. Jangan
                      gunakan nomor WhatsApp pelanggan sebagai username.
                    </li>
                    <li>
                      <strong>Kenali menu:</strong> Ruang kerja untuk percakapan, AI & knowledge
                      untuk jawaban dan pengujian, Operasional untuk koneksi dan pengiriman.
                    </li>
                    <li>
                      <strong>Periksa hak akses:</strong> menu dan tombol mengikuti izin akun.
                      Hubungi pengelola jika tugasmu memerlukan akses tambahan.
                    </li>
                    <li>
                      <strong>Kenali tombol:</strong> simpan draft menyimpan rancangan, publikasi
                      memberlakukan informasi/aturan, dan kirim atau masukkan ke outbox dapat
                      mengirim WhatsApp sungguhan.
                    </li>
                    <li>
                      <strong>Selesai bekerja:</strong> gunakan tombol Keluar di bagian bawah menu
                      agar akun tidak dipakai orang lain.
                    </li>
                  </ol>
                  <p className="guidebook-note">
                    Buku panduan hanya untuk dibaca. Membuka halaman ini atau mencari penjelasan
                    tidak mengirim pesan dan tidak mengubah pengaturan.
                  </p>
                </section>

                <section
                  className="section-card guidebook-chapter"
                  id="persiapan"
                  aria-labelledby="persiapan-title"
                >
                  <h2 id="persiapan-title">Persiapan pertama kali</h2>
                  <p>
                    Untuk pengelola yang baru menyiapkan layanan, ikuti urutan berikut sesuai izin
                    akun.
                  </p>
                  <ol>
                    <li>
                      <strong>Sesi WhatsApp:</strong> tautkan akun lewat QR dan tunggu status
                      Terhubung.
                    </li>
                    <li>
                      <strong>Integrasi AI:</strong> siapkan koneksi chat, simpan API key, pilih
                      model, uji, lalu aktifkan. Atur embedding jika memakai pencarian semantik
                      dokumen.
                    </li>
                    <li>
                      <strong>Knowledge dan Dokumen:</strong> siapkan informasi resmi, tinjau, dan
                      publikasikan. Tunggu dokumen selesai diproses.
                    </li>
                    <li>
                      <strong>Chatbot:</strong> atur balasan tetap dan fallback, simpan draft, uji,
                      lalu publikasikan.
                    </li>
                    <li>
                      <strong>Template dan Notifikasi CS:</strong> siapkan teks yang sering dipakai
                      serta nomor petugas yang menerima handoff.
                    </li>
                    <li>
                      <strong>Uji AI dan Readiness:</strong> coba pertanyaan, periksa sumber,
                      jalankan kasus uji, dan selesaikan penghambat kesiapan.
                    </li>
                    <li>
                      <strong>Inbox dan Keamanan:</strong> pastikan mode AI/Admin dan status
                      pengiriman sesuai sebelum melayani pelanggan.
                    </li>
                  </ol>
                </section>

                <section
                  className="section-card guidebook-chapter"
                  id="alur-harian"
                  aria-labelledby="alur-title"
                >
                  <h2 id="alur-title">Alur kerja sehari-hari</h2>
                  <h3>Menangani pelanggan</h3>
                  <p>
                    Beranda → periksa prioritas → Inbox → baca riwayat → ambil alih sebagai Admin
                    jika perlu → balas → pastikan status di Riwayat. Jika ada tugas Handoff,
                    selesaikan setelah pelanggan ditangani.
                  </p>
                  <h3>Menambahkan informasi baru</h3>
                  <p>
                    Knowledge → isi judul, kategori, jawaban resmi, dan variasi pertanyaan → Simpan
                    draft → periksa → setujui → publikasikan → Uji AI → tambahkan kasus uji di
                    Readiness.
                  </p>
                  <h3>Memperbaiki jawaban AI</h3>
                  <p>
                    Review AI → nilai jawaban bermasalah → periksa sumbernya → perbaiki Knowledge
                    atau Dokumen → uji ulang → pantau Analytics AI. Penilaian saja tidak otomatis
                    memperbaiki jawaban.
                  </p>
                </section>
              </>
            )}

            {!hasResults && (
              <section className="section-card" aria-labelledby="no-guide-results">
                <h2 id="no-guide-results">Penjelasan belum ditemukan</h2>
                <p>Coba kata yang lebih singkat, misalnya pesan, model, atau sumber.</p>
                <button type="button" className="secondary-button" onClick={() => setSearch('')}>
                  Tampilkan seluruh panduan
                </button>
              </section>
            )}

            {shownFeatures.map((feature) => {
              const guide = pageGuides[feature.path];
              const canOpen = user?.permissions.includes(feature.permission);
              const headingId = `judul-${feature.path.slice(1)}`;
              return (
                <section
                  className="section-card guidebook-chapter"
                  id={`fitur-${feature.path.slice(1)}`}
                  aria-labelledby={headingId}
                  key={feature.path}
                >
                  <p className="eyebrow">{feature.group}</p>
                  <h2 id={headingId}>{feature.title}</h2>
                  <p>{guide?.purpose}</p>
                  <h3>Langkah penggunaan</h3>
                  <ol>
                    {guide?.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  <h3>Bagian, tombol, dan hasilnya</h3>
                  {feature.topics.map((topic) => (
                    <SectionHelp topic={topic} key={topic} expanded />
                  ))}
                  <div className="guidebook-example">
                    <h3>Contoh penggunaan</h3>
                    <p>{feature.example}</p>
                  </div>
                  <p className="guidebook-note">
                    <strong>Perhatikan: </strong>
                    {guide?.note}
                  </p>
                  {canOpen ? (
                    <Link className="secondary-button" href={feature.path}>
                      Buka {feature.title}
                    </Link>
                  ) : (
                    <p className="muted">
                      Untuk membuka fitur ini, akun memerlukan izin pengelola. Penjelasannya tetap
                      dapat dibaca di sini.
                    </p>
                  )}
                </section>
              );
            })}

            {shownGlossary.length > 0 && (
              <section
                className="section-card guidebook-chapter"
                id="istilah"
                aria-labelledby="istilah-title"
              >
                <h2 id="istilah-title">Arti istilah dan status</h2>
                <dl className="guidebook-definitions">
                  {shownGlossary.map(([term, meaning]) => (
                    <div key={term}>
                      <dt>{term}</dt>
                      <dd>{meaning}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {shownTroubleshooting.length > 0 && (
              <section
                className="section-card guidebook-chapter"
                id="kendala"
                aria-labelledby="kendala-title"
              >
                <h2 id="kendala-title">Mengatasi kendala</h2>
                {shownTroubleshooting.map(([problem, solution]) => (
                  <div className="guidebook-problem" key={problem}>
                    <h3>{problem}</h3>
                    <p>{solution}</p>
                  </div>
                ))}
                <p className="guidebook-note">
                  Jika kendala berlanjut, catat halaman, waktu kejadian, dan pesan error untuk
                  pengelola. Jangan menyertakan password, API key, atau data pelanggan yang tidak
                  diperlukan.
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
