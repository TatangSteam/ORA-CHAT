import { describe, expect, it } from 'vitest';

import {
  expandedLexicalQueryTokens,
  lexicalQueryTokens,
  requiresMedicalEvidenceFallback,
  standaloneGreetingResponse,
  standaloneIdentityResponse,
  unsupportedGeneralAssistantResponse
} from './knowledge-repository.js';

describe('lexical RAG query normalization', () => {
  it('keeps meaningful Indonesian terms and removes conversational stop words', () => {
    expect(lexicalQueryTokens('Tolong, alamat layanan RAHO itu di mana ya?')).toEqual([
      'alamat',
      'layanan',
      'raho',
      'lokasi'
    ]);
  });

  it('normalizes, deduplicates, and strips tsquery operators', () => {
    expect(lexicalQueryTokens('JAM jam buka | !:* (Senin)')).toEqual(['jam', 'buka', 'senin']);
  });

  it('normalizes common Indonesian clitics for follow-up questions', () => {
    expect(lexicalQueryTokens('Terapinya bagaimana? Lokasinya di mana?')).toEqual([
      'terapi',
      'lokasi'
    ]);
  });

  it('corrects conservative domain typos and expands operational synonyms', () => {
    expect(lexicalQueryTokens('rahoo therapi dmn')).toEqual(['raho', 'terapi', 'lokasi']);
    expect(expandedLexicalQueryTokens('berapa harga dan alamatnya?')).toEqual([
      'harga',
      'biaya',
      'tarif',
      'alamat',
      'lokasi'
    ]);
  });

  it('caps query expansion to twelve tokens', () => {
    expect(
      lexicalQueryTokens(
        'satu dua tiga empat lima enam tujuh delapan sembilan sepuluh sebelas duabelas tigabelas'
      )
    ).toHaveLength(12);
  });

  it('fails closed when a medical qualifier is absent from retrieved evidence', () => {
    const generalSafety = 'Pelaksanaan terapi dilakukan setelah konsultasi dan evaluasi dokter.';
    expect(
      requiresMedicalEvidenceFallback('Apakah terapi aman untuk ibu hamil?', [generalSafety])
    ).toBe(true);
    expect(
      requiresMedicalEvidenceFallback('Apakah terapi aman untuk lansia?', [
        `${generalSafety} Lansia dapat mengikuti terapi setelah evaluasi dokter.`
      ])
    ).toBe(false);
    expect(
      requiresMedicalEvidenceFallback('Apakah terapi bisa menyembuhkan penyakit?', [
        'RAHO tidak mengklaim terapi dapat menyembuhkan semua penyakit.'
      ])
    ).toBe(false);
  });
});

describe('deterministic greeting', () => {
  it.each([
    ['halo', 'Halo!'],
    ['Hai kak 👋', 'Halo!'],
    ['selamat pagi', 'Selamat pagi!'],
    ['Halo selamat sore', 'Selamat sore!'],
    ['Hai, selamat pagi kak', 'Selamat pagi!'],
    ['Selamat malam halo min', 'Selamat malam!'],
    ['MALAM MIN!', 'Selamat malam!'],
    ["Assalamu'alaikum admin", 'Waalaikumsalam!']
  ])('answers a standalone greeting: %s', (question, expectedOpening) => {
    expect(standaloneGreetingResponse(question)).toBe(
      `${expectedOpening} 👋 Ada yang bisa saya bantu seputar RAHO Premier?`
    );
  });

  it.each([
    'halo, berapa harga terapi?',
    'halo selamat sore, apakah buka hari ini?',
    'selamat pagi, apakah bisa homecare?',
    'permisi mau booking',
    'halo saya sesak napas'
  ])('does not intercept a greeting combined with a real question: %s', (question) => {
    expect(standaloneGreetingResponse(question)).toBeNull();
  });
});

describe('deterministic assistant identity', () => {
  const answer =
    'Saya asisten virtual RAHO Premier. Saya dapat membantu menjawab pertanyaan seputar RAHO berdasarkan informasi resmi yang tersedia.';

  it.each([
    'kamu siapa?',
    'Siapa kamu',
    'Halo, ini bot apa?',
    'saya sedang bicara dengan siapa',
    'nama kamu siapa'
  ])('answers an assistant identity question: %s', (question) => {
    expect(standaloneIdentityResponse(question)).toBe(answer);
  });

  it.each([
    'siapa pendiri RAHO?',
    'kamu tahu harga terapi?',
    'ini bot apa manfaat Nano Bubble?',
    'saya bicara dengan dokter siapa?'
  ])('does not intercept a knowledge question: %s', (question) => {
    expect(standaloneIdentityResponse(question)).toBeNull();
  });
});

describe('deterministic scope guard', () => {
  const answer =
    'Maaf, saya khusus membantu informasi dan layanan RAHO Premier. Saya tidak dapat membuat kode, website, atau tugas umum lainnya.';

  it.each([
    'tolong buatkan kode python untuk web app',
    'landing page sederhana saja',
    'buatkan website toko online',
    'tolong debug JavaScript ini'
  ])('blocks an unsupported software task: %s', (question) => {
    expect(unsupportedGeneralAssistantResponse(question)).toBe(answer);
  });

  it.each([
    'Apakah RAHO memiliki website?',
    'Bagaimana cara booking terapi?',
    'Apakah ada aplikasi untuk booking RAHO?',
    'Apa itu Nano Bubble?'
  ])('allows a RAHO information question: %s', (question) => {
    expect(unsupportedGeneralAssistantResponse(question)).toBeNull();
  });
});
