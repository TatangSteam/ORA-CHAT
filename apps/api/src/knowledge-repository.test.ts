import { describe, expect, it, vi } from 'vitest';

import {
  chunkLexicalText,
  CUSTOMER_ADMIN_HANDOFF_RESPONSE,
  CUSTOMER_INFORMATION_CONFLICT_HANDOFF_RESPONSE,
  requiresInformationConflictHandoff,
  CUSTOMER_DEFAULT_CS_HANDOFF_RESPONSE,
  requestsContactNumber,
  CUSTOMER_INTEREST_HANDOFF_RESPONSE,
  CUSTOMER_MEDICAL_HANDOFF_RESPONSE,
  customerInterestHandoffResponse,
  expandedLexicalQueryTokens,
  highValueFaqQuestion,
  isAppointmentRequest,
  lexicalQueryTokens,
  PrismaKnowledgeRepository,
  requiresMedicalEvidenceFallback,
  requiresAnswerHandoff,
  requiresPersonalMedicalHandoff,
  standaloneGreetingResponse,
  standaloneIdentityResponse,
  unsupportedGeneralAssistantResponse
} from './knowledge-repository.js';

describe('customer-safe handoff copy', () => {
  it.each([
    'Sayangnya, di sumber yang tersedia, tidak disebutkan secara eksplisit apakah RAHO menyediakan layanan pengecekan darah.',
    'Saya belum tahu apakah bisa cek darah.',
    'Informasi cek darah belum tersedia.',
    'Berdasarkan sumber, silakan hubungi klinik.'
  ])('hands off uncertain answers even when the model marks them answered: %s', (answer) => {
    expect(
      requiresAnswerHandoff({ status: 'answered', shouldHandoff: false, answer, citations: ['K1'] })
    ).toBe(true);
  });

  it.each(['fallback', 'handoff'] as const)('hands off model status %s', (status) => {
    expect(
      requiresAnswerHandoff({
        status,
        shouldHandoff: status === 'handoff',
        answer: 'Silakan hubungi admin.',
        citations: []
      })
    ).toBe(true);
  });

  it.each([
    'Paket 7 sesi Rp12.500.000.',
    'Layanan cek darah tidak tersedia di klinik.',
    'Oksigen merupakan sumber energi.'
  ])('preserves supported answers: %s', (answer) => {
    expect(
      requiresAnswerHandoff({ status: 'answered', shouldHandoff: false, answer, citations: ['K1'] })
    ).toBe(false);
  });
  it('does not expose grounding implementation language to customers', () => {
    expect(CUSTOMER_ADMIN_HANDOFF_RESPONSE).toBe(
      'Maaf, saya belum dapat memastikan jawaban untuk pertanyaan tersebut. Saya akan menghubungkan Anda ke admin CS agar dapat dibantu lebih lanjut.'
    );
    expect(CUSTOMER_ADMIN_HANDOFF_RESPONSE).not.toMatch(/grounding|ter-grounding/iu);
  });
});

describe('lexical knowledge chunking', () => {
  it('does not skip a long token after selecting an earlier whitespace boundary', () => {
    const longPrefix = 'A'.repeat(1_000);
    const longToken = 'B'.repeat(700);
    const chunks = chunkLexicalText(`${longPrefix} ${longToken}`, 1_600, 200);

    expect(chunks.map(({ content }) => content.length)).toEqual([1_000, 901]);
    expect(chunks.some(({ content }) => content.includes(longPrefix))).toBe(true);
    expect(chunks.some(({ content }) => content.includes(longToken))).toBe(true);
  });
});

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

  it('normalizes common WhatsApp abbreviations for price questions', () => {
    expect(lexicalQueryTokens('min brp hrg therapi raho?')).toEqual(['harga', 'terapi', 'raho']);
  });

  it('normalizes the common spaced spelling of gasotransmitter', () => {
    expect(lexicalQueryTokens('Apa itu gaso transmitter?')).toEqual(['gasotransmitter']);
    expect(lexicalQueryTokens('Jelaskan gaso-transmitters')).toEqual([
      'jelaskan',
      'gasotransmitter'
    ]);
  });

  it('normalizes Nano Bubble spelling variants and ignores a conversational greeting', () => {
    expect(
      lexicalQueryTokens(
        'selamat pagi admin, mau tanya nanobuble itu berupa infus ya? apakah aman?'
      )
    ).toEqual(['nano', 'bubble', 'infus', 'aman']);
  });

  it('normalizes home care spelling variants into the published FAQ intent', () => {
    expect(lexicalQueryTokens('Apakah RAHO bisa home care?')).toEqual(['raho', 'homecare']);
    expect(lexicalQueryTokens('Halo mau tanya apakah RAHO bisa homecare')).toEqual([
      'halo',
      'raho',
      'homecare'
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

    const infusionEvidence =
      'Nano Bubble Therapy di RAHO diberikan melalui infus sebagai media penghantaran Nano Bubble ke dalam tubuh.';
    expect(
      requiresMedicalEvidenceFallback('Nanobuble itu berupa infus ya, apakah aman?', [
        infusionEvidence
      ])
    ).toBe(true);
    expect(
      requiresMedicalEvidenceFallback('Nanobuble itu berupa infus ya, apakah aman?', [
        infusionEvidence,
        'Keamanan member merupakan prioritas utama RAHO. Pelaksanaan terapi dilakukan oleh tenaga profesional sesuai prosedur.'
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

  it.each(['Siapa presiden Indonesia sekarang?', 'Bagaimana cuaca hari ini?'])(
    'blocks an obvious unrelated knowledge question: %s',
    (question) => {
      expect(unsupportedGeneralAssistantResponse(question)).toContain(
        'khusus membantu informasi dan layanan RAHO Premier'
      );
    }
  );

  it.each([
    'Apakah RAHO memiliki website?',
    'Bagaimana cara booking terapi?',
    'Apakah ada aplikasi untuk booking RAHO?',
    'Apa itu Nano Bubble?'
  ])('allows a RAHO information question: %s', (question) => {
    expect(unsupportedGeneralAssistantResponse(question)).toBeNull();
  });
});

describe('deterministic high-value FAQ routing', () => {
  it.each([
    ['min brp hrg therapi raho?', 'Berapa harga terapi?'],
    ['harganya berapa kak?', 'Berapa harga terapi?'],
    ['Selamat malam\nMau tanya utk treatment infus brapa ya ?', 'Berapa harga terapi?'],
    ['Infus brp ya kak?', 'Berapa harga terapi?'],
    ['Terapi berapa?', 'Berapa harga terapi?'],
    ['RAHO ada dimana aja?', 'Di mana saja cabang RAHO Club Premier?'],
    ['Tampilkan semua lokasi cabang', 'Di mana saja cabang RAHO Club Premier?']
  ])('routes repeated operational questions without model generation: %s', (question, faq) => {
    expect(highValueFaqQuestion(question)).toBe(faq);
    expect(highValueFaqQuestion(question)).toBe(faq);
  });

  it.each([
    'Berapa biaya membership?',
    'Berapa harga homecare?',
    'Berapa harga home care?',
    'Treatment home-care brapa?',
    'Berapa kali terapi yang dibutuhkan?',
    'Infus berapa lama?',
    'Terapi butuh brp sesi?',
    'Infus berapa ml?',
    'Terapi untuk usia berapa?',
    'RAHO terdekat dari Bandung'
  ])('does not overmatch a more specific question: %s', (question) => {
    expect(highValueFaqQuestion(question)).toBeNull();
  });

  it.each(['min brp hrg therapi raho?', 'Selamat malam\nMau tanya utk treatment infus brapa ya ?'])(
    'answers a casual price question from the exact published FAQ without generation: %s',
    async (question) => {
      const tenantId = '019ff9bb-0000-7000-8000-000000000051';
      const answer = 'Paket 7 Sesi Rp12.500.000 dan Paket 15 Sesi Rp22.500.000.';
      const findMany = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            itemVersion: {
              id: '019ff9bb-0000-7000-8000-000000000052',
              answer,
              lexicalChunks: [
                {
                  id: '019ff9bb-0000-7000-8000-000000000053',
                  content: answer
                }
              ]
            }
          }
        ]);
      const createTrace = vi.fn(
        async ({ data }: { data: { id: string; sources: { create: unknown[] } } }) => ({
          id: data.id,
          sources: data.sources.create
        })
      );
      const repository = new PrismaKnowledgeRepository(
        {
          knowledgeQuestionVariant: { findMany },
          $transaction: vi.fn(async (operation: (client: unknown) => Promise<unknown>) =>
            operation({ aiMessageTrace: { create: createTrace } })
          )
        } as never,
        Buffer.alloc(32),
        {} as never
      );

      const result = await repository.answer(
        tenantId,
        question,
        '019ff9bb-0000-7000-8000-000000000054'
      );

      expect(result).toMatchObject({
        status: 'answered',
        shouldHandoff: false,
        answer,
        fallbackReason: null
      });
      expect(result.sources).toHaveLength(1);
      expect(findMany.mock.calls[1]?.[0].where.normalizedQuestion).toBe('berapa harga terapi?');
    }
  );
});

describe('appointment CS redirect', () => {
  it.each([
    'Hari Rabu saja, spt rencana semula utk 2 orang serumah, saya dan isteri',
    'Tolong konfirmasi jadwal home care saya',
    'Bisa ganti jadwal reservasi?',
    'Saya ingin home care hari Rabu untuk dua orang',
    'ingin booking homecare'
  ])('recognizes appointment arrangements: %s', (question) => {
    expect(isAppointmentRequest(question)).toBe(true);
  });

  it('uses customer context for a short scheduling follow-up', () => {
    expect(
      isAppointmentRequest('Rabu saja ya', [
        { role: 'customer', content: 'Saya ingin booking homecare' }
      ])
    ).toBe(true);
    expect(isAppointmentRequest('Rabu saja ya')).toBe(false);
  });

  it.each([
    'Apakah RAHO menyediakan homecare?',
    'Jam pelayanan homecare RAHO',
    'Apakah klinik buka hari Rabu?',
    'Berapa biaya home care untuk dua orang?'
  ])('preserves general service questions: %s', (question) => {
    expect(isAppointmentRequest(question)).toBe(false);
  });

  it.each(['**0851-3622-2772**', null])(
    'hands scheduling to default CS without looking up a contact: %s',
    async (answer) => {
      const findMany = vi.fn().mockResolvedValue(
        answer
          ? [
              {
                itemVersion: { id: 'cs-version', answer, lexicalChunks: [] }
              }
            ]
          : []
      );
      const repository = new PrismaKnowledgeRepository(
        {
          knowledgeQuestionVariant: { findMany },
          $transaction: async (operation: (client: unknown) => Promise<unknown>) =>
            operation({
              aiMessageTrace: {
                create: async ({
                  data
                }: {
                  data: { id: string; sources: { create: unknown[] } };
                }) => ({ id: data.id, sources: data.sources.create })
              }
            })
        } as never,
        Buffer.alloc(32),
        {} as never
      );
      const result = await repository.answer(
        'tenant',
        'Hari Rabu saja, spt rencana semula utk 2 orang serumah, saya dan isteri',
        'request'
      );
      expect(result).toMatchObject({
        status: 'handoff',
        shouldHandoff: true,
        fallbackReason: 'appointment_request',
        answer:
          'Baik, saya teruskan permintaan jadwal Anda ke tim CS kami agar dibantu pengaturannya ya.'
      });
      expect(findMany).not.toHaveBeenCalled();
    }
  );
});

describe('deterministic customer-interest handoff', () => {
  it.each([
    'gimana caranya? saya tertarik',
    'Saya berminat ikut program',
    'mau daftar terapi',
    'ingin booking homecare',
    'bagaimana cara reservasi?'
  ])('immediately offers an admin handoff for a sales lead: %s', (question) => {
    expect(customerInterestHandoffResponse(question)).toBe(CUSTOMER_INTEREST_HANDOFF_RESPONSE);
  });

  it.each([
    'Apa itu Nano Bubble?',
    'Berapa harga terapi?',
    'Bagaimana cara kerja Nano Bubble?',
    'Apakah RAHO menyediakan homecare?'
  ])('does not hand off a normal information question: %s', (question) => {
    expect(customerInterestHandoffResponse(question)).toBeNull();
  });

  it('creates a handoff before retrieval or model generation', async () => {
    const createTrace = vi.fn(
      async ({ data }: { data: { id: string; sources: { create: unknown[] } } }) => ({
        id: data.id,
        sources: data.sources.create
      })
    );
    const transaction = vi.fn(async (operation: (client: unknown) => Promise<unknown>) =>
      operation({ aiMessageTrace: { create: createTrace } })
    );
    const findMany = vi.fn();
    const repository = new PrismaKnowledgeRepository(
      {
        knowledgeQuestionVariant: { findMany },
        $transaction: transaction
      } as never,
      Buffer.alloc(32),
      {} as never
    );

    const result = await repository.answer(
      '019ff9bb-0000-7000-8000-000000000041',
      'gimana caranya? saya tertarik',
      '019ff9bb-0000-7000-8000-000000000042'
    );

    expect(result).toMatchObject({
      status: 'handoff',
      shouldHandoff: true,
      answer: CUSTOMER_INTEREST_HANDOFF_RESPONSE,
      fallbackReason: 'customer_interest'
    });
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('deterministic exact published FAQ', () => {
  const tenantId = '019ff9bb-0000-7000-8000-000000000001';
  const answer =
    'Nano Bubble merupakan teknologi penghantaran gas berukuran nano yang dalam materi dijelaskan memiliki kemampuan untuk membawa dan menghantarkan berbagai gas ke dalam tubuh. Gas yang dibahas meliputi O₂, H₂, NO, CO, dan H₂S.';

  it('returns the stored answer without invoking dynamic handlers or generation', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        itemVersion: {
          id: '019ff9bb-0000-7000-8000-000000000002',
          answer,
          lexicalChunks: [
            {
              id: '019ff9bb-0000-7000-8000-000000000003',
              content: `Apa itu Nanobubbles?\n${answer}`
            }
          ]
        }
      }
    ]);
    const createTrace = vi.fn(
      async ({ data }: { data: { id: string; sources: { create: unknown[] } } }) => ({
        id: data.id,
        sources: data.sources.create
      })
    );
    const transaction = vi.fn(async (operation: (client: unknown) => Promise<unknown>) =>
      operation({ aiMessageTrace: { create: createTrace } })
    );
    const geocode = vi.fn();
    const repository = new PrismaKnowledgeRepository(
      {
        knowledgeQuestionVariant: { findMany },
        $transaction: transaction
      } as never,
      Buffer.alloc(32),
      {} as never,
      () => new Date('2026-08-31T00:00:00.000Z'),
      { geocode }
    );

    const result = await repository.answer(
      tenantId,
      '  Apa itu Nanobubbles?  ',
      '019ff9bb-0000-7000-8000-000000000004'
    );

    expect(result).toMatchObject({
      status: 'answered',
      answer,
      shouldHandoff: false,
      fallbackReason: null
    });
    expect(result.sources).toHaveLength(1);
    expect(geocode).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith({
      where: {
        tenantId,
        normalizedQuestion: 'apa itu nanobubbles?',
        itemVersion: {
          tenantId,
          status: 'published',
          publishedFor: { is: { tenantId, status: 'published' } }
        }
      },
      select: {
        itemVersion: {
          select: {
            id: true,
            answer: true,
            lexicalChunks: {
              where: { tenantId },
              orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
              take: 1
            }
          }
        }
      },
      orderBy: { id: 'asc' },
      take: 2
    });
  });

  it('does not choose an answer when published variants are ambiguous', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        { itemVersion: { id: 'version-1', answer: 'Satu', lexicalChunks: [] } },
        { itemVersion: { id: 'version-2', answer: 'Dua', lexicalChunks: [] } }
      ]);
    const repository = new PrismaKnowledgeRepository(
      { knowledgeQuestionVariant: { findMany } } as never,
      Buffer.alloc(32),
      {} as never
    ) as unknown as {
      exactPublishedFaqAnswer(tenant: string, question: string): Promise<unknown>;
    };

    await expect(
      repository.exactPublishedFaqAnswer(tenantId, 'Apa itu Nanobubbles?')
    ).resolves.toBe(null);
  });
});

describe('deterministic compound Nano Bubble FAQ', () => {
  const tenantId = '019ff9bb-0000-7000-8000-000000000011';

  it('combines the published infusion and safety answers for the customer question', async () => {
    const infusionAnswer =
      'Ya. Nano Bubble Therapy di RAHO diberikan melalui infus sebagai media penghantaran Nano Bubble ke dalam tubuh sesuai prosedur terapi.';
    const safetyAnswer =
      'Keamanan member merupakan prioritas utama RAHO. Sebelum terapi, member menjalani konsultasi dan evaluasi kondisi. Pelaksanaan terapi dilakukan oleh tenaga profesional sesuai prosedur.';
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          normalizedQuestion: 'apakah terapi raho menggunakan infus?',
          itemVersion: {
            id: '019ff9bb-0000-7000-8000-000000000012',
            answer: infusionAnswer,
            lexicalChunks: [
              {
                id: '019ff9bb-0000-7000-8000-000000000013',
                content: infusionAnswer
              }
            ]
          }
        },
        {
          normalizedQuestion: 'apakah raho aman?',
          itemVersion: {
            id: '019ff9bb-0000-7000-8000-000000000014',
            answer: safetyAnswer,
            lexicalChunks: [
              {
                id: '019ff9bb-0000-7000-8000-000000000015',
                content: safetyAnswer
              }
            ]
          }
        }
      ]);
    const createTrace = vi.fn(
      async ({ data }: { data: { id: string; sources: { create: unknown[] } } }) => ({
        id: data.id,
        sources: data.sources.create
      })
    );
    const transaction = vi.fn(async (operation: (client: unknown) => Promise<unknown>) =>
      operation({ aiMessageTrace: { create: createTrace } })
    );
    const geocode = vi.fn();
    const repository = new PrismaKnowledgeRepository(
      {
        knowledgeQuestionVariant: { findMany },
        $transaction: transaction
      } as never,
      Buffer.alloc(32),
      {} as never,
      () => new Date('2026-09-28T00:00:00.000Z'),
      { geocode }
    );

    const result = await repository.answer(
      tenantId,
      'selamat pagi admin, mau tanya nanobuble itu berupa infus ya? apakah aman?',
      '019ff9bb-0000-7000-8000-000000000016'
    );

    expect(result).toMatchObject({
      status: 'answered',
      answer: `${infusionAnswer}\n\n${safetyAnswer}`,
      shouldHandoff: false,
      fallbackReason: null
    });
    expect(result.sources).toHaveLength(2);
    expect(geocode).not.toHaveBeenCalled();
  });
});

describe('deterministic homecare intent FAQ', () => {
  it('answers a conversational homecare question directly from the published FAQ', async () => {
    const tenantId = '019ff9bb-0000-7000-8000-000000000031';
    const answer =
      'RAHO Premier juga menyediakan layanan homecare. Tim medis akan datang ke lokasi yang telah dijadwalkan dan memberikan terapi sesuai prosedur serta hasil evaluasi dokter.';
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          itemVersion: {
            id: '019ff9bb-0000-7000-8000-000000000032',
            answer,
            lexicalChunks: [
              {
                id: '019ff9bb-0000-7000-8000-000000000033',
                content: answer
              }
            ]
          }
        }
      ]);
    const createTrace = vi.fn(
      async ({ data }: { data: { id: string; sources: { create: unknown[] } } }) => ({
        id: data.id,
        sources: data.sources.create
      })
    );
    const transaction = vi.fn(async (operation: (client: unknown) => Promise<unknown>) =>
      operation({ aiMessageTrace: { create: createTrace } })
    );
    const geocode = vi.fn();
    const repository = new PrismaKnowledgeRepository(
      {
        knowledgeQuestionVariant: { findMany },
        $transaction: transaction
      } as never,
      Buffer.alloc(32),
      {} as never,
      () => new Date('2026-09-28T07:30:00.000Z'),
      { geocode }
    );

    const result = await repository.answer(
      tenantId,
      'halo mau tanya apakah raho bisa homecare',
      '019ff9bb-0000-7000-8000-000000000034'
    );

    expect(result).toMatchObject({
      status: 'answered',
      shouldHandoff: false,
      fallbackReason: null,
      answer
    });
    expect(result.sources).toHaveLength(1);
    expect(geocode).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          normalizedQuestion: 'apakah raho menyediakan layanan homecare?'
        })
      })
    );
  });
});

describe('medical review handoff', () => {
  it.each([
    'Amankah utk yg punya jantung?',
    'Amankah bagi penderita jantung?',
    'Jantung amankah?',
    'Bolehkah diabetes?',
    'Bagaimana utk yg punya backgroud CA breast?',
    'Saya punya riwayat kanker payudara',
    'Untuk pasien ca mammae apakah boleh terapi?',
    'Ibu saya breast cancer, bisa ikut program?',
    'Saya pernah kena stroke, apakah cocok untuk terapi ini?',
    'Kalau penderita diabetes gimana?',
    'Apakah aman untuk ibu hamil?'
  ])('immediately hands off personal medical questions: %s', async (question) => {
    const findMany = vi.fn();
    const repository = new PrismaKnowledgeRepository(
      {
        knowledgeQuestionVariant: { findMany },
        $transaction: async (operation: (client: unknown) => Promise<unknown>) =>
          operation({
            aiMessageTrace: {
              create: async ({
                data
              }: {
                data: { id: string; sources: { create: unknown[] } };
              }) => ({ id: data.id, sources: data.sources.create })
            }
          })
      } as never,
      Buffer.alloc(32),
      {} as never
    );
    const search = vi.spyOn(repository, 'search');
    const result = await repository.answer('tenant', question, 'request');
    expect(result).toMatchObject({
      status: 'handoff',
      shouldHandoff: true,
      fallbackReason: 'medical_review_required'
    });
    expect(result.answer).toBe(CUSTOMER_MEDICAL_HANDOFF_RESPONSE);
    expect(result.sources).toEqual([]);
    expect(result.answer).not.toMatch(/sumber|knowledge|belum.*(?:tahu|memastikan)/iu);
    expect(findMany).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });

  it.each([
    'Berapa harga terapi?',
    'Apa itu Nano Bubble?',
    'Apakah terapi ini aman?',
    'Bagaimana background perusahaan RAHO?',
    'Riwayat reservasi saya bagaimana?'
  ])('preserves ordinary service and general information questions: %s', (question) => {
    expect(requiresPersonalMedicalHandoff(question)).toBe(false);
  });

  it('hands off a service question with no matching knowledge', async () => {
    const repository = new PrismaKnowledgeRepository(
      {
        knowledgeQuestionVariant: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: async (operation: (client: unknown) => Promise<unknown>) =>
          operation({
            aiMessageTrace: {
              create: async ({
                data
              }: {
                data: { id: string; sources: { create: unknown[] } };
              }) => ({ id: data.id, sources: data.sources.create })
            }
          })
      } as never,
      Buffer.alloc(32),
      {} as never
    );
    vi.spyOn(repository, 'search').mockResolvedValue({
      status: 'ok',
      value: [],
      indexVersionId: null,
      retrievalMode: 'lexical'
    });
    const result = await repository.answer(
      'tenant',
      'Apakah disini bisa cek darah juga?',
      'request'
    );
    expect(result).toMatchObject({
      status: 'handoff',
      shouldHandoff: true,
      answer: CUSTOMER_ADMIN_HANDOFF_RESPONSE,
      fallbackReason: 'insufficient_grounding'
    });
  });

  it('hands a condition-specific suitability question to CS when evidence is insufficient', async () => {
    const tenantId = '019ff9bb-0000-7000-8000-000000000021';
    const createTrace = vi.fn(
      async ({ data }: { data: { id: string; sources: { create: unknown[] } } }) => ({
        id: data.id,
        sources: data.sources.create
      })
    );
    const transaction = vi.fn(async (operation: (client: unknown) => Promise<unknown>) =>
      operation({ aiMessageTrace: { create: createTrace } })
    );
    const repository = new PrismaKnowledgeRepository(
      {
        knowledgeQuestionVariant: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: transaction
      } as never,
      Buffer.alloc(32),
      {} as never,
      () => new Date('2026-09-28T04:00:00.000Z'),
      { geocode: vi.fn() }
    );
    vi.spyOn(repository, 'search').mockResolvedValue({
      status: 'ok',
      value: [
        {
          id: '019ff9bb-0000-7000-8000-000000000022',
          content: 'Terapi dilakukan setelah konsultasi dan evaluasi umum.',
          score: 0.5,
          documentId: null,
          itemVersionId: '019ff9bb-0000-7000-8000-000000000023',
          sourceKind: 'lexical',
          label: 'K1',
          preview: 'Terapi dilakukan setelah konsultasi dan evaluasi umum.'
        }
      ],
      indexVersionId: null,
      retrievalMode: 'lexical'
    });

    const result = await repository.answer(
      tenantId,
      'Saya pernah kena stroke, apakah cocok untuk terapi ini?',
      '019ff9bb-0000-7000-8000-000000000024'
    );

    expect(result).toMatchObject({
      status: 'handoff',
      shouldHandoff: true,
      fallbackReason: 'medical_review_required',
      answer: CUSTOMER_MEDICAL_HANDOFF_RESPONSE
    });
  });
});

describe('default CS contact routing', () => {
  const makeRepository = (answer: string) => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ itemVersion: { id: 'contact-version', answer, lexicalChunks: [] } }]);
    const create = vi.fn(async ({ data }) => ({ id: data.id, sources: data.sources.create }));
    const repository = new PrismaKnowledgeRepository(
      {
        knowledgeQuestionVariant: { findMany },
        $transaction: async (operation: (client: unknown) => Promise<unknown>) =>
          operation({ aiMessageTrace: { create } })
      } as never,
      Buffer.alloc(32),
      {} as never
    );
    return { repository, findMany, create };
  };

  it.each([
    'Silakan hubungi Botanica 08213103738.',
    'Silakan hubungi tim CS Botanica untuk reservasi.',
    'Hubungi WhatsApp +62 821-3103-738.',
    'Hubungi https://wa.me/628213103738.',
    'Nomor telepon: (021) 12345678.'
  ])('blocks unsolicited contact numbers even in exact FAQ answers: %s', async (answer) => {
    const { repository, create } = makeRepository(answer);
    const result = await repository.answer('tenant', 'Apa layanan di Botanica?', 'request');
    expect(result).toMatchObject({
      status: 'handoff',
      shouldHandoff: true,
      answer: CUSTOMER_DEFAULT_CS_HANDOFF_RESPONSE,
      fallbackReason: 'unsolicited_contact_redirect',
      sources: []
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          answer: CUSTOMER_DEFAULT_CS_HANDOFF_RESPONSE,
          status: 'handoff'
        })
      })
    );
  });

  it.each(['Berapa nomor CS?', 'Minta nomor WhatsApp RAHO', 'Bagaimana menghubungi CS RAHO?'])(
    'looks up only the default CS FAQ for %s',
    async (question) => {
      const { repository, findMany } = makeRepository('0851-3622-2772');
      const result = await repository.answer('tenant', question, 'request');
      expect(result).toMatchObject({ status: 'answered', answer: '0851-3622-2772' });
      expect(findMany.mock.calls[0]?.[0].where.normalizedQuestion).toBe(
        'berapa nomor whatsapp customer service raho?'
      );
    }
  );

  it('does not return an entire contact directory for a single branch request', async () => {
    const { repository } = makeRepository('Botanica: 08213103738. Bali: 085168927435.');
    const result = await repository.answer('tenant', 'Apa alamat dan nomor Botanica?', 'request');
    expect(result).toMatchObject({
      status: 'handoff',
      shouldHandoff: true,
      answer: CUSTOMER_DEFAULT_CS_HANDOFF_RESPONSE
    });
  });

  it('allows the Botanica number when its contact is explicitly requested', async () => {
    const { repository, findMany } = makeRepository('Nomor Botanica: 08213103738.');
    const result = await repository.answer(
      'tenant',
      'Berapa nomor WhatsApp cabang Botanica?',
      'request'
    );
    expect(result).toMatchObject({
      status: 'answered',
      shouldHandoff: false,
      answer: 'Nomor Botanica: 08213103738.'
    });
    expect(findMany.mock.calls[0]?.[0].where.normalizedQuestion).toBe(
      'berapa nomor whatsapp cabang botanica?'
    );
  });

  it.each([
    'Saya mau homecare di Bandung',
    'Tolong telepon saya',
    'Ini nomor saya 081234567890',
    'Apakah bisa lewat WhatsApp?',
    'Jangan kasih nomor Botanica'
  ])(
    'does not treat a service or callback request as a request for contact details: %s',
    (question) => {
      expect(requestsContactNumber(question)).toBe(false);
    }
  );
});

describe('conflicting customer information handoff', () => {
  it.each([
    'Tapi saya pernah tanya sebelum nya , katanya ada di Yogjakarta',
    'Tapi saya pernah tanya sebelumnya, katanya ada di Yogyakarta',
    'Kemarin kata CS ada cabang di Jogja',
    'Padahal katanya ada di Bandung',
    'Kok jawaban sekarang beda?',
    'Info yang saya dapat berbeda',
    'Itu tidak sesuai informasi sebelumnya'
  ])('hands off before FAQ retrieval or generation: %s', async (question) => {
    const findMany = vi.fn();
    const create = vi.fn(async ({ data }) => ({ id: data.id, sources: data.sources.create }));
    const repository = new PrismaKnowledgeRepository(
      {
        knowledgeQuestionVariant: { findMany },
        $transaction: async (operation: (client: unknown) => Promise<unknown>) =>
          operation({ aiMessageTrace: { create } })
      } as never,
      Buffer.alloc(32),
      {} as never
    );
    const search = vi.spyOn(repository, 'search');
    const result = await repository.answer('tenant', question, 'request');
    expect(result).toMatchObject({
      status: 'handoff',
      shouldHandoff: true,
      fallbackReason: 'information_conflict',
      answer: CUSTOMER_INFORMATION_CONFLICT_HANDOFF_RESPONSE,
      sources: []
    });
    expect(findMany).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });

  it.each([
    'Apakah ada cabang di Yogyakarta?',
    'Saya mau tanya lokasi cabang',
    'Apa perbedaan homecare dan terapi di klinik?',
    'Kemarin saya terapi, berapa harga paketnya?',
    'Saya pernah tanya harga, boleh lihat paketnya?',
    'Tapi kalau di Bandung alamatnya di mana?'
  ])('preserves ordinary questions: %s', (question) => {
    expect(requiresInformationConflictHandoff(question)).toBe(false);
  });
});
