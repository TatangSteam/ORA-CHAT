import { describe, expect, it, vi } from 'vitest';

import { handoffNotificationContent, PrismaMessagingRepository } from './messaging-repository.js';

const tenantId = '019ff9bb-0000-7000-8000-000000000101';
const conversationId = '019ff9bb-0000-7000-8000-000000000102';
const triggerMessageId = '019ff9bb-0000-7000-8000-000000000103';

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
      'Member: Yati Sudono\nWhatsApp: +628123456789\nPertanyaan: Saya pernah kena stroke, apakah cocok?\nAlasan: Perlu evaluasi tim/dokter'
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
      conversation: { upsert: vi.fn(), update: vi.fn().mockResolvedValue({}) }
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
