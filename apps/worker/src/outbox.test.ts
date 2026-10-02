import { describe, expect, it, vi } from 'vitest';

import { deliverOutbox, recoveredMessageStatus } from './outbox.js';

describe('durable outbox recovery vocabulary', () => {
  it('maps a pre-send expired lease back to the queueable Message state', () => {
    expect(recoveredMessageStatus('retryable')).toBe('queued');
  });

  it('preserves post-send uncertainty for manual reconciliation', () => {
    expect(recoveredMessageStatus('unknown')).toBe('unknown');
  });
});

describe('queued AI response after CS replies', () => {
  it.each([true, false])(
    'suppresses obsolete automation without suppressing valid delivery: %s',
    async (superseded) => {
      const now = new Date('2026-10-02T03:00:00Z');
      const tx = {
        contact: { update: vi.fn() },
        outboxMessage: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'outbox',
            tenantId: 'tenant',
            messageId: 'ai-message',
            status: 'queued',
            attemptCount: 0,
            maxAttempts: 3,
            message: {
              id: 'ai-message',
              occurredAt: now,
              content: 'Jawaban AI',
              conversation: {
                channel: 'whatsapp',
                contact: { providerJid: '6281234567890@s.whatsapp.net' }
              }
            }
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn()
        },
        message: { update: vi.fn() },
        messageEvent: { create: vi.fn() }
      };
      const prisma = {
        $transaction: async (operation: (client: unknown) => Promise<unknown>) => operation(tx),
        whatsAppSessionState: { findUnique: vi.fn().mockResolvedValue({ state: 'connected' }) },
        message: { findFirst: vi.fn().mockResolvedValue(superseded ? { id: 'ai-message' } : null) }
      };
      const provider = { send: vi.fn().mockResolvedValue({ providerMessageId: 'provider-id' }) };
      const result = await deliverOutbox(
        prisma as never,
        provider,
        { tenantId: 'tenant', outboxMessageId: 'outbox' } as never,
        'worker',
        () => now
      );
      if (superseded) {
        expect(result.status).toBe('noop');
        expect(provider.send).not.toHaveBeenCalled();
        expect(tx.message.update).toHaveBeenCalledWith({
          where: { id: 'ai-message' },
          data: { status: 'cancelled' }
        });
      } else {
        expect(result.status).toBe('delivered');
        expect(provider.send).toHaveBeenCalledOnce();
      }
      expect(prisma.message.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            source: { in: ['ai', 'rule'] },
            events: { none: { eventType: 'handoff.notification.created' } },
            conversation: {
              messages: {
                some: {
                  direction: 'outgoing',
                  source: 'manual',
                  status: { notIn: ['failed', 'cancelled'] },
                  occurredAt: { gte: now }
                }
              }
            }
          })
        })
      );
    }
  );
});
