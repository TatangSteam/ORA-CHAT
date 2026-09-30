/* global fetch */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';

const baseUrl = process.env.KNOWLEDGE_IMPORT_BASE_URL ?? 'http://127.0.0.1:3000';
const sourcePath =
  process.argv[2] ??
  process.env.KNOWLEDGE_IMPORT_SOURCE ??
  '/Users/mac/Downloads/Data Google Search (1).docx';
const passwordPath =
  process.env.BOOTSTRAP_ADMIN_PASSWORD_FILE ?? '.secrets/bootstrap_admin_password';
const dryRun = process.env.KNOWLEDGE_IMPORT_DRY_RUN === '1';

const normalize = (value) =>
  value.normalize('NFKC').trim().toLocaleLowerCase('id-ID').replace(/\s+/gu, ' ');

const clean = (value) =>
  value
    .normalize('NFKC')
    .replace(/\u2028/gu, '\n')
    .replace(/[ \t]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();

const decodeXml = (value) =>
  value
    .replace(/<w:tab\s*\/?\s*>/gu, '\t')
    .replace(/<w:br\s*\/?\s*>/gu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&#x([0-9a-f]+);/giu, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&#([0-9]+);/gu, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'");

const extractParagraphs = (path) => {
  const xml = execFileSync('unzip', ['-p', path, 'word/document.xml'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  return [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gu)]
    .map((match) => clean(decodeXml(match[1])))
    .filter(Boolean);
};

const parseSourceQuestions = (paragraphs) => {
  const answers = new Map();
  let section = null;
  let question = null;
  let answerParts = [];

  const flush = () => {
    if (!question) return;
    const answer = clean(answerParts.join('\n'));
    if (!answer) throw new Error(`Jawaban kosong untuk pertanyaan: ${question}`);
    answers.set(normalize(question), { question, answer, section });
    question = null;
    answerParts = [];
  };

  for (const paragraph of paragraphs) {
    if (paragraph === 'Prioritas FAQ Customer Service') {
      flush();
      break;
    }
    const heading = paragraph.match(/^(\d+)\.\s+(.+)$/u);
    if (heading) {
      flush();
      section = Number.parseInt(heading[1], 10);
      continue;
    }
    if (paragraph.endsWith('?')) {
      flush();
      question = paragraph.replace(/^•\s*/u, '').trim();
      continue;
    }
    if (question) answerParts.push(paragraph.replace(/^•\s*/u, '').trim());
  }
  flush();
  return answers;
};

const categories = [
  { name: 'Tentang RAHO', slug: 'tentang-raho' },
  { name: 'Layanan & Program', slug: 'layanan-dan-program' },
  { name: 'Harga & Paket', slug: 'harga-dan-paket' },
  { name: 'Lokasi & Jam Operasional', slug: 'lokasi-dan-jam-operasional' },
  { name: 'Keamanan & Kredibilitas', slug: 'keamanan-dan-kredibilitas' },
  { name: 'Nano Bubble & Edukasi', slug: 'nano-bubble-dan-edukasi' },
  { name: 'Kesehatan & Kelayakan Terapi', slug: 'kesehatan-dan-kelayakan-terapi' },
  { name: 'Booking & Konsultasi', slug: 'booking-dan-konsultasi' },
  { name: 'Karier', slug: 'karier' }
];

const item = (category, title, sourceQuestion, variants, reviewNote = null) => ({
  category,
  title,
  sourceQuestion,
  variants,
  reviewNote
});

const plans = [
  item('tentang-raho', 'RAHO Premier', 'Apa itu Raho Premier?', ['Apa itu Raho Premier?']),
  item(
    'tentang-raho',
    'Identitas RAHO Club',
    'Raho perusahaan apa?',
    ['Raho perusahaan apa?', 'Mengapa disebut Raho Club?', 'Apa itu Raho Club?'],
    'Konflik identitas perusahaan, komunitas, dan fasilitas perlu diselaraskan.'
  ),
  item('tentang-raho', 'Fokus RAHO', 'Raho bergerak di bidang apa?', [
    'Raho bergerak di bidang apa?'
  ]),
  item(
    'tentang-raho',
    'Perbedaan RAHO Club dan RAHO Premier',
    'Apa perbedaan Raho Club dan Raho Premier?',
    ['Apa perbedaan Raho Club dan Raho Premier?']
  ),
  item(
    'tentang-raho',
    'Reverse Aging dan Homeostasis',
    'Apa yang dimaksud Reverse Aging & Homeostasis Club?',
    ['Apa yang dimaksud Reverse Aging & Homeostasis Club?'],
    'Terminologi dan klaim kesehatan wajib ditinjau tenaga medis.'
  ),

  item(
    'layanan-dan-program',
    'Layanan klinik dan homecare',
    'Apa saja layanan di Raho?',
    ['Apa saja layanan di Raho?', 'Di mana bisa melakukan terapi Nano Bubble?'],
    'Ketersediaan cabang dan homecare perlu diverifikasi.'
  ),
  item('layanan-dan-program', 'Durasi satu sesi terapi', 'Berapa lama satu sesi terapi?', [
    'Berapa lama satu sesi terapi?'
  ]),
  item(
    'layanan-dan-program',
    'Kenyamanan selama terapi',
    'Apakah terapi ini sakit?',
    ['Apakah terapi ini sakit?'],
    'Pernyataan pengalaman pasien wajib ditinjau tenaga medis.'
  ),
  item(
    'layanan-dan-program',
    'Pemberian terapi melalui infus',
    'Apakah terapi menggunakan infus?',
    ['Apakah terapi menggunakan infus?'],
    'Prosedur medis wajib ditinjau tenaga medis.'
  ),
  item(
    'layanan-dan-program',
    'Infus Nano Bubble',
    'Apa itu infus Nano Bubble?',
    ['Apa itu infus Nano Bubble?'],
    'Definisi prosedur medis wajib ditinjau tenaga medis.'
  ),
  item(
    'layanan-dan-program',
    'Perbedaan Nano Bubble Therapy',
    'Apa perbedaan Nano Bubble Therapy dengan terapi lainnya?',
    ['Apa perbedaan Nano Bubble Therapy dengan terapi lainnya?'],
    'Perbandingan dan klaim ilmiah perlu didukung bukti.'
  ),
  item(
    'layanan-dan-program',
    'Fokus layanan RAHO',
    'Apakah Raho menjual produk?',
    ['Apakah Raho menjual produk?'],
    'Istilah observasi atau naracoba memerlukan pemeriksaan etik dan legal.'
  ),
  item(
    'layanan-dan-program',
    'Pengiriman produk ke luar kota',
    'Apakah produk bisa dikirim ke luar kota?',
    ['Apakah produk bisa dikirim ke luar kota?'],
    'Bertentangan dengan pernyataan bahwa RAHO tidak menjual produk.'
  ),
  item(
    'layanan-dan-program',
    'Booster bersifat opsional',
    'Apakah saya harus membeli booster setelah mengikuti terapi?',
    ['Apakah saya harus membeli booster setelah mengikuti terapi?'],
    'Rekomendasi klinis dan komersial perlu ditinjau.'
  ),

  item(
    'harga-dan-paket',
    'Biaya terapi',
    'Berapa harga terapi di Raho Club?',
    ['Berapa harga terapi di Raho Club?', 'Berapa biaya terapi?'],
    'Informasi harga mudah berubah dan perlu tanggal verifikasi.'
  ),
  item(
    'harga-dan-paket',
    'Pilihan paket terapi',
    'Apakah ada paket terapi?',
    ['Apakah ada paket terapi?', 'Produk apa saja yang tersedia?'],
    'Nominal harga dan paket perlu diverifikasi sebelum publikasi.'
  ),
  item('harga-dan-paket', 'Membership RAHO', 'Apakah ada membership?', ['Apakah ada membership?']),
  item('harga-dan-paket', 'Keuntungan menjadi member', 'Apa keuntungan menjadi member?', [
    'Apa keuntungan menjadi member?'
  ]),
  item(
    'harga-dan-paket',
    'Biaya membership',
    'Berapa biaya membership?',
    ['Berapa biaya membership?'],
    'Ketentuan komersial perlu diverifikasi.'
  ),
  item(
    'harga-dan-paket',
    'Program promo',
    'Apakah ada promo?',
    ['Apakah ada promo?'],
    'Informasi promo mudah berubah dan perlu tanggal verifikasi.'
  ),

  item(
    'lokasi-dan-jam-operasional',
    'Daftar cabang RAHO',
    'Cabang Raho ada di mana saja?',
    ['Cabang Raho ada di mana saja?', 'Cabang terdekat di mana?'],
    'Dokumen belum memuat daftar alamat cabang yang konkret.'
  ),
  item('lokasi-dan-jam-operasional', 'Petunjuk menuju cabang', 'Bagaimana cara menuju cabang?', [
    'Bagaimana cara menuju cabang?'
  ]),
  item(
    'lokasi-dan-jam-operasional',
    'Fasilitas parkir cabang',
    'Apakah tersedia parkir?',
    ['Apakah tersedia parkir?'],
    'Ketersediaan parkir di setiap cabang perlu diverifikasi.'
  ),
  item(
    'lokasi-dan-jam-operasional',
    'Jam operasional cabang',
    'Jam operasional berapa?',
    ['Jam operasional berapa?'],
    'Dokumen belum memuat jam operasional konkret per cabang.'
  ),
  item(
    'lokasi-dan-jam-operasional',
    'Jadwal praktik dokter',
    'Dokter praktik kapan?',
    ['Dokter praktik kapan?'],
    'Jadwal dokter mudah berubah dan perlu verifikasi cabang.'
  ),

  item(
    'keamanan-dan-kredibilitas',
    'Legalitas dan perizinan RAHO',
    'Apakah Raho sudah memiliki izin?',
    ['Apakah Raho resmi?', 'Apakah Raho sudah memiliki izin?'],
    'Wajib dilengkapi bukti badan hukum, izin, fasilitas, dan regulator.'
  ),
  item(
    'keamanan-dan-kredibilitas',
    'Keamanan layanan RAHO',
    'Apakah Raho aman?',
    ['Apakah Raho aman?', 'Apakah terapi ini aman?'],
    'Klaim keamanan medis wajib ditinjau tenaga medis dan legal.'
  ),
  item(
    'keamanan-dan-kredibilitas',
    'Dasar penelitian terapi',
    'Apakah terapi Raho sudah diteliti?',
    [
      'Apakah terapi Raho sudah diteliti?',
      'Apakah terapi ini memiliki dasar ilmiah?',
      'Apakah ada hasil penelitian?'
    ],
    'Wajib menyertakan sumber ilmiah yang dapat diverifikasi.'
  ),
  item(
    'keamanan-dan-kredibilitas',
    'Transparansi layanan RAHO',
    'Apakah Raho penipuan?',
    ['Apakah Raho penipuan?'],
    'Pernyataan legal dan reputasi perlu diverifikasi.'
  ),
  item(
    'keamanan-dan-kredibilitas',
    'Testimoni member',
    'Bagaimana testimoni pasien?',
    ['Bagaimana testimoni pasien?'],
    'Testimoni dan tautan sumber perlu diverifikasi.'
  ),
  item(
    'keamanan-dan-kredibilitas',
    'Pandangan dokter mengenai terapi',
    'Apa kata dokter mengenai terapi ini?',
    ['Apa kata dokter mengenai terapi ini?'],
    'Pernyataan medis wajib disetujui dokter yang berwenang.'
  ),
  item(
    'keamanan-dan-kredibilitas',
    'Posisi terapi sebagai terapi pendukung',
    'Apa itu pengobatan Raho?',
    ['Apa itu pengobatan Raho?'],
    'Status fasilitas dan batas klaim medis perlu diselaraskan.'
  ),

  item(
    'nano-bubble-dan-edukasi',
    'Pengertian Nano Bubble',
    'Apa itu Nano Bubble?',
    ['Apa itu Nano Bubble?'],
    'Definisi dan klaim fisiologis wajib ditinjau sumber ilmiah.'
  ),
  item(
    'nano-bubble-dan-edukasi',
    'Pengertian Nano Bubble Therapy',
    'Terapi Raho seperti apa?',
    ['Apa itu terapi Raho?', 'Terapi Raho seperti apa?', 'Apa itu Nano Bubble Therapy?'],
    'Klaim medis dan fisiologis wajib ditinjau.'
  ),
  item(
    'nano-bubble-dan-edukasi',
    'Cara kerja Nano Bubble Therapy',
    'Bagaimana Nano Bubble bekerja?',
    [
      'Bagaimana cara kerja terapi Raho?',
      'Bagaimana Nano Bubble bekerja?',
      'Bagaimana terapi bekerja?'
    ],
    'Klaim kapiler, hipoksia, kavitasi, dan penghantaran gas berisiko tinggi.'
  ),
  item(
    'nano-bubble-dan-edukasi',
    'Manfaat Nano Bubble Therapy',
    'Apa manfaat infus Nano Bubble?',
    [
      'Apa manfaat terapi Raho?',
      'Apa manfaat infus Nano Bubble?',
      'Apa manfaat Nano Bubble?',
      'Apa manfaat terapi?'
    ],
    'Semua klaim manfaat medis wajib didukung bukti dan persetujuan medis.'
  ),
  item(
    'nano-bubble-dan-edukasi',
    'Pengertian gasotransmitter',
    'Apa itu gasotransmitter?',
    ['Apa itu gasotransmitter?'],
    'Teks sumber rusak dan wajib diperbaiki serta diverifikasi.'
  ),
  item(
    'nano-bubble-dan-edukasi',
    'Pengertian mikrosirkulasi',
    'Apa itu mikrosirkulasi?',
    ['Apa itu mikrosirkulasi?'],
    'Definisi ilmiah perlu diverifikasi.'
  ),
  item(
    'nano-bubble-dan-edukasi',
    'Alasan penggunaan Nano Bubble',
    'Mengapa Nano Bubble digunakan?',
    ['Mengapa Nano Bubble digunakan?'],
    'Klaim kestabilan dan penggunaan terapi perlu sumber.'
  ),
  item(
    'nano-bubble-dan-edukasi',
    'Hubungan Nano Bubble dengan oksigen',
    'Apa hubungan Nano Bubble dengan oksigen?',
    ['Apa hubungan Nano Bubble dengan oksigen?'],
    'Klaim fisiologis perlu ditinjau sumber ilmiah.'
  ),
  item(
    'nano-bubble-dan-edukasi',
    'Hubungan Nano Bubble dengan kesehatan sel',
    'Apa hubungan Nano Bubble dengan kesehatan sel?',
    ['Apa hubungan Nano Bubble dengan kesehatan sel?'],
    'Klaim kesehatan sel perlu ditinjau sumber ilmiah.'
  ),
  item(
    'nano-bubble-dan-edukasi',
    'Intelligent Gas Delivery System (IGDS)',
    'Apa itu Intelligent Gas Delivery System (IGDS)?',
    ['Apa itu Intelligent Gas Delivery System (IGDS)?'],
    'Klaim proprietary dan medis perlu diverifikasi.'
  ),

  item(
    'kesehatan-dan-kelayakan-terapi',
    'Peserta terapi',
    'Siapa saja yang bisa mengikuti terapi?',
    ['Siapa saja yang bisa mengikuti terapi?'],
    'Kriteria pasien wajib ditinjau tenaga medis.'
  ),
  item(
    'kesehatan-dan-kelayakan-terapi',
    'Kondisi kesehatan dan kelayakan terapi',
    'Terapi ini cocok untuk penyakit apa?',
    ['Terapi ini cocok untuk penyakit apa?'],
    'Tidak boleh memberi indikasi penyakit tanpa penilaian medis.'
  ),
  item(
    'kesehatan-dan-kelayakan-terapi',
    'Terapi untuk orang sehat',
    'Apakah terapi ini untuk orang sehat?',
    ['Apakah terapi ini untuk orang sehat?'],
    'Klaim kesehatan wajib ditinjau tenaga medis.'
  ),
  item(
    'kesehatan-dan-kelayakan-terapi',
    'Terapi untuk lansia',
    'Apakah terapi ini bisa untuk lansia?',
    ['Apakah terapi ini bisa untuk lansia?'],
    'Kelayakan lansia wajib melalui evaluasi medis.'
  ),
  item(
    'kesehatan-dan-kelayakan-terapi',
    'Terapi dan proses pemulihan',
    'Apakah terapi ini membantu pemulihan?',
    ['Apakah terapi ini membantu pemulihan?'],
    'Klaim pemulihan wajib ditinjau tenaga medis.'
  ),
  item(
    'kesehatan-dan-kelayakan-terapi',
    'Penderita penyakit kronis',
    'Apakah terapi ini aman bagi penderita penyakit kronis?',
    ['Apakah terapi ini aman bagi penderita penyakit kronis?'],
    'Klaim keamanan untuk penyakit kronis berisiko tinggi.'
  ),
  item(
    'kesehatan-dan-kelayakan-terapi',
    'Jumlah sesi terapi',
    'Berapa kali terapi yang dibutuhkan?',
    ['Berapa kali terapi yang dibutuhkan?'],
    'Rekomendasi jumlah sesi bersifat medis dan komersial.'
  ),
  item(
    'kesehatan-dan-kelayakan-terapi',
    'Efektivitas dan hasil terapi',
    'Seberapa efektif terapi Raho?',
    ['Seberapa efektif terapi Raho?', 'Apakah hasil terapi berbeda pada setiap orang?'],
    'Klaim efektivitas wajib ditinjau tenaga medis.'
  ),

  item(
    'booking-dan-konsultasi',
    'Cara membuat janji',
    'Bagaimana cara membuat janji?',
    ['Bagaimana cara membuat janji?', 'Bagaimana cara reservasi?'],
    'Nomor WhatsApp perlu diverifikasi sebelum publikasi.'
  ),
  item('booking-dan-konsultasi', 'Alur konsultasi', 'Bagaimana alur konsultasi?', [
    'Bagaimana alur konsultasi?'
  ]),
  item('booking-dan-konsultasi', 'Reservasi sebelum datang', 'Apakah harus reservasi?', [
    'Apakah harus reservasi?'
  ]),
  item(
    'booking-dan-konsultasi',
    'Durasi konsultasi',
    'Berapa lama konsultasi berlangsung?',
    ['Berapa lama konsultasi berlangsung?'],
    'Durasi operasional perlu diverifikasi.'
  ),
  item(
    'booking-dan-konsultasi',
    'Kunjungan langsung atau walk-in',
    'Apakah bisa datang langsung?',
    ['Apakah bisa datang langsung?'],
    'Kebijakan walk-in mudah berubah.'
  ),

  item(
    'karier',
    'Informasi lowongan RAHO',
    'Apakah Raho sedang membuka lowongan?',
    ['Apakah Raho sedang membuka lowongan?', 'Apakah ada lowongan kerja?'],
    'Status lowongan mudah berubah.'
  ),
  item(
    'karier',
    'Cara melamar kerja di RAHO',
    'Bagaimana cara melamar kerja di Raho?',
    ['Bagaimana cara melamar kerja di Raho?'],
    'Alamat email HR perlu diverifikasi.'
  ),
  item(
    'karier',
    'Posisi yang tersedia',
    'Posisi apa saja yang tersedia?',
    ['Posisi apa saja yang tersedia?'],
    'Daftar posisi mudah berubah.'
  ),
  item(
    'karier',
    'Budaya kerja RAHO',
    'Bagaimana budaya kerja di Raho?',
    ['Bagaimana budaya kerja di Raho?'],
    'Narasi brand dan penggunaan istilah perusahaan perlu diselaraskan.'
  )
];

const cookieFrom = (response, name) => {
  const setCookies = response.headers.getSetCookie?.() ?? [];
  const header = setCookies.find((value) => value.startsWith(`${name}=`));
  const value = header?.match(new RegExp(`^${name}=([^;]*)`, 'u'))?.[1];
  if (!value) throw new Error(`${name} cookie tidak ditemukan`);
  return `${name}=${value}`;
};

const request = async (path, init = {}) => {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${path} mengembalikan non-JSON (${response.status})`);
  }
  return { response, body, text };
};

const login = async () => {
  const preLogin = await request('/api/admin/v1/auth/csrf');
  if (preLogin.response.status !== 200) throw new Error(`CSRF awal gagal: ${preLogin.text}`);
  const loginCookie = cookieFrom(preLogin.response, 'raho_login_csrf');
  const signedIn = await request('/api/admin/v1/auth/login', {
    method: 'POST',
    headers: {
      cookie: loginCookie,
      'content-type': 'application/json',
      'x-csrf-token': preLogin.body.data.csrfToken
    },
    body: JSON.stringify({
      tenantSlug: process.env.KNOWLEDGE_IMPORT_TENANT ?? 'default',
      username: process.env.KNOWLEDGE_IMPORT_USERNAME ?? 'superadmin',
      password: readFileSync(passwordPath, 'utf8').trim()
    })
  });
  if (signedIn.response.status !== 201) throw new Error(`Login gagal: ${signedIn.text}`);
  const sessionName = signedIn.response.headers
    .getSetCookie()
    .some((value) => value.startsWith('__Host-raho_session='))
    ? '__Host-raho_session'
    : 'raho_session';
  const cookie = cookieFrom(signedIn.response, sessionName);
  const me = await request('/api/admin/v1/me', { headers: { cookie } });
  if (me.response.status !== 200) throw new Error(`Sesi admin gagal: ${me.text}`);
  return { cookie, csrf: me.body.data.csrfToken };
};

const paragraphs = extractParagraphs(sourcePath);
const source = parseSourceQuestions(paragraphs);
if (source.size !== 71) {
  throw new Error(`Dokumen berubah: diharapkan 71 Q&A, ditemukan ${source.size}`);
}

for (const plan of plans) {
  if (!source.has(normalize(plan.sourceQuestion))) {
    throw new Error(`Pertanyaan sumber tidak ditemukan: ${plan.sourceQuestion}`);
  }
}

const duplicates = plans.filter(
  (plan, index) =>
    plans.findIndex((candidate) => normalize(candidate.title) === normalize(plan.title)) !== index
);
if (duplicates.length)
  throw new Error(`Judul rencana duplikat: ${duplicates.map((value) => value.title).join(', ')}`);

if (dryRun) {
  process.stdout.write(
    `${JSON.stringify(
      {
        dryRun: true,
        sourceQuestions: source.size,
        categories: categories.length,
        items: plans.length,
        reviewRequired: plans.filter((plan) => plan.reviewNote).length
      },
      null,
      2
    )}\n`
  );
  process.exit(0);
}

const session = await login();
const admin = (path, init = {}) =>
  request(`/api/admin/v1${path}`, {
    ...init,
    headers: {
      cookie: session.cookie,
      ...(!['GET', 'HEAD'].includes(init.method ?? 'GET') ? { 'x-csrf-token': session.csrf } : {}),
      ...(typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}),
      ...init.headers
    }
  });

const categoryResponse = await admin('/ai/knowledge/categories');
if (categoryResponse.response.status !== 200) {
  throw new Error(`Gagal membaca kategori: ${categoryResponse.text}`);
}
const categoryBySlug = new Map(
  categoryResponse.body.data.map((category) => [category.slug, category])
);
let categoriesCreated = 0;

for (const definition of categories) {
  if (categoryBySlug.has(definition.slug)) continue;
  const created = await admin('/ai/knowledge/categories', {
    method: 'POST',
    body: JSON.stringify({
      ...definition,
      parentId: null,
      reason: 'Impor kategori FAQ dari Data Google Search pada 11 Agustus 2026.'
    })
  });
  if (created.response.status !== 201) {
    throw new Error(`Gagal membuat kategori ${definition.slug}: ${created.text}`);
  }
  categoryBySlug.set(definition.slug, created.body.data);
  categoriesCreated += 1;
}

let itemsCreated = 0;
let itemsSkipped = 0;
const createdByCategory = new Map();

for (const plan of plans) {
  const category = categoryBySlug.get(plan.category);
  if (!category) throw new Error(`Kategori tidak ditemukan: ${plan.category}`);
  const existingResponse = await admin(
    `/ai/knowledge?query=${encodeURIComponent(plan.title)}&limit=100`
  );
  if (existingResponse.response.status !== 200) {
    throw new Error(`Gagal memeriksa knowledge ${plan.title}: ${existingResponse.text}`);
  }
  const existing = existingResponse.body.data.find(
    (candidate) =>
      normalize(candidate.title) === normalize(plan.title) && candidate.category?.id === category.id
  );
  if (existing) {
    itemsSkipped += 1;
    continue;
  }

  const sourceEntry = source.get(normalize(plan.sourceQuestion));
  const variants = [
    ...new Map(plan.variants.map((variant) => [normalize(variant), clean(variant)])).values()
  ];
  const reason = plan.reviewNote
    ? `Impor draft Data Google Search; REVIEW WAJIB: ${plan.reviewNote}`
    : 'Impor draft terkurasi dari Data Google Search pada 11 Agustus 2026.';
  const created = await admin('/ai/knowledge', {
    method: 'POST',
    body: JSON.stringify({
      categoryId: category.id,
      title: plan.title,
      answer: sourceEntry.answer,
      questionVariants: variants,
      reason
    })
  });
  if (created.response.status !== 201) {
    throw new Error(`Gagal membuat knowledge ${plan.title}: ${created.text}`);
  }
  itemsCreated += 1;
  createdByCategory.set(plan.category, (createdByCategory.get(plan.category) ?? 0) + 1);
}

process.stdout.write(
  `${JSON.stringify(
    {
      sourceQuestions: source.size,
      categories: {
        total: categories.length,
        created: categoriesCreated,
        reused: categories.length - categoriesCreated
      },
      drafts: {
        planned: plans.length,
        created: itemsCreated,
        skippedExisting: itemsSkipped,
        reviewRequired: plans.filter((plan) => plan.reviewNote).length,
        createdByCategory: Object.fromEntries(createdByCategory)
      }
    },
    null,
    2
  )}\n`
);
