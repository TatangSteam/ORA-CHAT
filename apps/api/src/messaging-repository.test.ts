import { describe, expect, it, vi } from 'vitest';

import {
  handoffNotificationContent,
  PrismaMessagingRepository,
  whatsappSafeText
} from './messaging-repository.js';

const tenantId = '019ff9bb-0000-7000-8000-000000000101';
const conversationId = '019ff9bb-0000-7000-8000-000000000102';
const triggerMessageId = '019ff9bb-0000-7000-8000-000000000103';

describe('WhatsApp-safe AI copy', () => {
  it('converts web Markdown headings and bold text to WhatsApp-safe text', () => {
    expect(whatsappSafeText('#### Paket 7 Sesi\n\n**Rp12.500.000**')).toBe(
      'Paket 7 Sesi\n\n*Rp12.500.000*'
    );
  });
});

describe('WhatsApp handoff notification', () => {
  it('formats the member context for CS without exposing an internal reason code', () => {
    expect(
      handoffNotificationContent({
        displayName: 'Yati Sudono',
        normalizedPhone: '628123456789',
        question: 'Saya pernah kena stroke, apakah cocok?',
        reasonCode: 'medical_review_required'
      })
    ).toContain(
      'Member: Yati Sudono\nWhatsApp: +628123456789\nPertanyaan: Saya pernah kena stroke, apakah cocok?\nAlasan: Mohon telepon member untuk tindak lanjut pertanyaan kondisi medis'
    );
  });

  it('queues one durable CS notification when a new AI handoff is created', async () => {
    const tx = {
      message: { create: vi.fn().mockResolvedValue({}) },
      handoffTask: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({})
      },
      contact: {
        upsert: vi.fn().mockResolvedValue({ id: '019ff9bb-0000-7000-8000-000000000104' }),
        update: vi.fn().mockResolvedValue({})
      },
      conversation: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        upsert: vi.fn().mockResolvedValue({ id: '019ff9bb-0000-7000-8000-000000000105' }),
        update: vi.fn().mockResolvedValue({})
      }
    };
    const prisma = {
      handoffNotificationSetting: { findUnique: vi.fn().mockResolvedValue(null) },
      conversation: {
        findFirst: vi.fn().mockResolvedValue({
          id: conversationId,
          contact: { displayName: 'Yati Sudono', normalizedPhone: '628111111111' }
        })
      },
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) =>
        operation(tx)
      )
    };
    const repository = new PrismaMessagingRepository(prisma as never);

    const result = await repository.createAutomatedInboundResponse({
      tenantId,
      conversationId,
      triggerMessageId,
      content: 'Saya teruskan pertanyaan ini ke tim CS.',
      shouldHandoff: true,
      reasonCode: 'medical_review_required',
      traceId: null,
      now: new Date('2026-09-28T04:00:00.000Z'),
      customerQuestion: 'Saya pernah kena stroke, apakah cocok?',
      csNotificationPhone: '081234567890'
    });

    expect(result).toMatchObject({ handoffTaskId: expect.any(String) });
    expect(result?.notificationOutboxMessageId).toEqual(expect.any(String));
    expect(tx.message.create).toHaveBeenCalledTimes(2);
    expect(tx.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ handlingMode: 'human', followUpRequired: true })
      })
    );
    expect(tx.contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_normalizedPhone: { tenantId, normalizedPhone: '6281234567890' }
        }
      })
    );
    expect(tx.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ handlingMode: 'human' }),
        update: expect.objectContaining({ handlingMode: 'human' })
      })
    );
    expect(tx.message.create.mock.calls[1]![0]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'rule',
          content: expect.stringContaining('Yati Sudono')
        })
      })
    );
  });

  it('does not notify CS again while the conversation already has an active handoff', async () => {
    const tx = {
      message: { create: vi.fn().mockResolvedValue({}) },
      handoffTask: {
        findFirst: vi.fn().mockResolvedValue({ id: '019ff9bb-0000-7000-8000-000000000106' }),
        create: vi.fn()
      },
      contact: { upsert: vi.fn(), update: vi.fn() },
      conversation: {
        upsert: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    };
    const prisma = {
      handoffNotificationSetting: { findUnique: vi.fn().mockResolvedValue(null) },
      conversation: {
        findFirst: vi.fn().mockResolvedValue({
          id: conversationId,
          contact: { displayName: null, normalizedPhone: '628111111111' }
        })
      },
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) =>
        operation(tx)
      )
    };
    const repository = new PrismaMessagingRepository(prisma as never);

    const result = await repository.createAutomatedInboundResponse({
      tenantId,
      conversationId,
      triggerMessageId,
      content: 'Pertanyaan sedang ditangani tim CS.',
      shouldHandoff: true,
      reasonCode: 'medical_review_required',
      traceId: null,
      now: new Date('2026-09-28T04:00:00.000Z'),
      customerQuestion: 'Apakah cocok untuk saya?',
      csNotificationPhone: '081234567890'
    });

    expect(result?.notificationOutboxMessageId).toBeNull();
    expect(tx.contact.upsert).not.toHaveBeenCalled();
    expect(tx.message.create).toHaveBeenCalledTimes(1);
  });
});

describe('handoff notification settings', () => {
  it('creates the first tenant setting and records an audit entry', async () => {
    const updatedAt = new Date('2026-09-28T04:10:00.000Z');
    const tx = {
      handoffNotificationSetting: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn(),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          normalizedPhone: '6281234567890',
          enabled: true,
          revision: 1,
          updatedAt
        })
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) }
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) =>
        operation(tx)
      )
    };
    const repository = new PrismaMessagingRepository(prisma as never);

    const result = await repository.updateHandoffNotificationSetting({
      tenantId,
      actorUserId: '019ff9bb-0000-7000-8000-000000000107',
      phone: '081234567890',
      enabled: true,
      expectedRevision: 0,
      reason: 'Mengaktifkan notifikasi CS',
      requestId: '019ff9bb-0000-7000-8000-000000000108'
    });

    expect(result).toEqual({
      status: 'ok',
      value: { phone: '6281234567890', enabled: true, revision: 1, updatedAt }
    });
    expect(tx.handoffNotificationSetting.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        normalizedPhone: '6281234567890',
        enabled: true,
        revision: 1
      })
    });
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
  });

  it('rejects a stale dashboard revision without changing the setting', async () => {
    const tx = {
      handoffNotificationSetting: {
        findUnique: vi.fn().mockResolvedValue({ revision: 3 }),
        create: vi.fn(),
        updateMany: vi.fn()
      }
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) =>
        operation(tx)
      )
    };
    const repository = new PrismaMessagingRepository(prisma as never);

    await expect(
      repository.updateHandoffNotificationSetting({
        tenantId,
        actorUserId: '019ff9bb-0000-7000-8000-000000000107',
        phone: '081234567890',
        enabled: true,
        expectedRevision: 2,
        reason: 'Memperbarui notifikasi CS',
        requestId: '019ff9bb-0000-7000-8000-000000000108'
      })
    ).resolves.toEqual({ status: 'revision_conflict' });
    expect(tx.handoffNotificationSetting.updateMany).not.toHaveBeenCalled();
  });
});

describe('phone reply synchronization', () => {
  const input = {
    tenantId,
    providerEventId: 'phone:upsert',
    providerMessageId: 'phone',
    senderJid: '6281234567890@s.whatsapp.net',
    fromMe: true,
    displayName: 'Local admin name',
    content: 'Saya bantu ya',
    occurredAt: new Date('2026-10-02T03:00:00Z'),
    requestId: 'request'
  };
  const setup = () => {
    const tx = {
      contact: { upsert: vi.fn().mockResolvedValue({ id: 'contact' }), updateMany: vi.fn() },
      conversation: {
        upsert: vi.fn().mockResolvedValue({ id: conversationId, handlingMode: 'bot' }),
        updateMany: vi.fn()
      },
      message: { create: vi.fn().mockResolvedValue({ id: 'new-message' }) },
      chatbotRuleVersion: { findFirst: vi.fn() }
    };
    const prisma = {
      message: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) =>
        operation(tx)
      )
    };
    return { tx, prisma, repository: new PrismaMessagingRepository(prisma as never) };
  };

  it('stores a sent manual reply without queueing a send, increasing unread count, or running rules/AI', async () => {
    const { tx, repository } = setup();
    expect(await repository.ingestInbound(input)).toMatchObject({
      duplicate: false,
      automationAllowed: false,
      ruleOutboxMessageId: null
    });
    const data = tx.message.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      direction: 'outgoing',
      source: 'manual',
      status: 'sent',
      providerMessageId: 'phone',
      occurredAt: input.occurredAt
    });
    expect(data).not.toHaveProperty('outbox');
    expect(tx.chatbotRuleVersion.findFirst).not.toHaveBeenCalled();
    const contactData = tx.contact.upsert.mock.calls[0]![0];
    expect(contactData.create).not.toHaveProperty('displayName');
    expect(contactData.update).not.toHaveProperty('lastInboundAt');
    const conversationData = tx.conversation.upsert.mock.calls[0]![0];
    expect(conversationData.create).toMatchObject({ unreadCount: 0, handlingMode: 'human' });
    expect(conversationData.update).not.toHaveProperty('unreadCount');
    expect(tx.conversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ lastMessageAt: null }, { lastMessageAt: { lte: input.occurredAt } }]
        }),
        data: expect.objectContaining({ handlingMode: 'human' })
      })
    );
  });

  it('deduplicates a dashboard echo or repeated phone event by provider ID', async () => {
    const { prisma, tx, repository } = setup();
    prisma.message.findFirst.mockResolvedValue({ id: 'existing', conversationId });
    expect(await repository.ingestInbound(input)).toMatchObject({
      duplicate: true,
      messageId: 'existing',
      automationAllowed: false
    });
    expect(tx.message.create).not.toHaveBeenCalled();
    expect(tx.conversation.updateMany).not.toHaveBeenCalled();
  });
});

describe('CS takeover during AI generation', () => {
  it('discards the generated response if CS has already switched the conversation to human', async () => {
    const create = vi.fn();
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const repository = new PrismaMessagingRepository({
      conversation: {
        findFirst: vi.fn().mockResolvedValue({
          id: conversationId,
          contact: { displayName: 'Member', normalizedPhone: '628111111111' }
        })
      },
      handoffNotificationSetting: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: async (operation: (client: unknown) => Promise<unknown>) =>
        operation({ conversation: { updateMany }, message: { create } })
    } as never);
    const result = await repository.createAutomatedInboundResponse({
      tenantId,
      conversationId,
      triggerMessageId,
      content: 'Jawaban AI terlambat',
      shouldHandoff: false,
      reasonCode: 'answered',
      traceId: null,
      now: new Date(),
      customerQuestion: 'Halo'
    });
    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: conversationId, tenantId, handlingMode: 'bot' } })
    );
  });
});

describe('dashboard CS reply takeover', () => {
  it('switches both new and existing conversations to human when an admin replies', async () => {
    const tx = {
      contact: {
        findFirst: vi
          .fn()
          .mockResolvedValue({
            id: 'contact',
            providerJid: '6281234567890@s.whatsapp.net',
            consentStatus: 'unknown'
          }),
        update: vi.fn()
      },
      conversation: { upsert: vi.fn().mockResolvedValue({ id: conversationId }), update: vi.fn() },
      message: { create: vi.fn() },
      idempotencyKey: { create: vi.fn() },
      auditLog: { create: vi.fn() }
    };
    const repository = new PrismaMessagingRepository({
      idempotencyKey: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: async (operation: (client: unknown) => Promise<unknown>) => operation(tx)
    } as never);
    await repository.createOutbound({
      tenantId,
      actorUserId: 'admin',
      contactId: 'contact',
      idempotencyKey: 'reply',
      requestHash: 'hash',
      source: 'manual',
      content: 'Saya bantu ya',
      requestId: 'request',
      now: new Date()
    });
    expect(tx.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ handlingMode: 'human' }),
        update: expect.objectContaining({ handlingMode: 'human' })
      })
    );
  });
});
