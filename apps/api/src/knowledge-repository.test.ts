import { describe, expect, it, vi } from 'vitest';

import {
  chunkLexicalText,
  CUSTOMER_ADMIN_HANDOFF_RESPONSE,
  CUSTOMER_INTEREST_HANDOFF_RESPONSE,
  customerInterestHandoffResponse,
  expandedLexicalQueryTokens,
  lexicalQueryTokens,
  PrismaKnowledgeRepository,
  requiresMedicalEvidenceFallback,
  standaloneGreetingResponse,
  standaloneIdentityResponse,
  unsupportedGeneralAssistantResponse
} from './knowledge-repository.js';

describe('customer-safe handoff copy', () => {
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

  it.each([
    'Apakah RAHO memiliki website?',
    'Bagaimana cara booking terapi?',
    'Apakah ada aplikasi untuk booking RAHO?',
    'Apa itu Nano Bubble?'
  ])('allows a RAHO information question: %s', (question) => {
    expect(unsupportedGeneralAssistantResponse(question)).toBeNull();
  });
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
      answer: expect.stringContaining('Saya teruskan pertanyaan ini ke tim CS')
    });
  });
});
