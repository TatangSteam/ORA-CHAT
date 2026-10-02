import { readFileSync } from 'node:fs';

import { internalOutboundSendResponseSchema, providerJidSchema } from '@raho/contracts';
import { generateUuidV7, type PrismaClient } from '@raho/db';
import type { OutboundDeliveryJob } from '@raho/queue';

export const OUTBOX_DISPATCH_INTERVAL_MS = 2_000;
export const OUTBOX_RECOVERY_INTERVAL_MS = 15_000;
export const OUTBOX_LEASE_MS = 30_000;

export interface DurableEnqueuer {
  enqueue(tenantId: string, outboxMessageId: string, availableAt?: Date): Promise<void>;
}

export interface ProviderDelivery {
  send(input: {
    tenantId: string;
    outboxMessageId: string;
    deliveryAttemptId: string;
    recipientJid: string;
    content: string;
  }): Promise<{ providerMessageId: string }>;
}

export class NotAcceptedDeliveryError extends Error {
  public constructor(public readonly code: string) {
    super(code);
  }
}

export const recoveredMessageStatus = (outboxStatus: 'retryable' | 'unknown') =>
  outboxStatus === 'retryable' ? ('queued' as const) : ('unknown' as const);

const nextBackoff = (attempt: number): number =>
  Math.min(300_000, 5_000 * 2 ** Math.max(0, attempt - 1));

export const dispatchDueOutbox = async (
  prisma: PrismaClient,
  enqueuer: DurableEnqueuer,
  now = new Date()
): Promise<number> => {
  const rows = await prisma.outboxMessage.findMany({
    where: { status: { in: ['queued', 'retryable'] }, availableAt: { lte: now } },
    select: { id: true, tenantId: true, availableAt: true },
    orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
    take: 100
  });
  const results = await Promise.allSettled(
    rows.map((row) => enqueuer.enqueue(row.tenantId, row.id, row.availableAt))
  );
  return results.filter(({ status }) => status === 'fulfilled').length;
};

export const recoverExpiredOutbox = async (
  prisma: PrismaClient,
  now = new Date()
): Promise<{ retryable: number; unknown: number }> => {
  const expired = await prisma.outboxMessage.findMany({
    where: { status: { in: ['leased', 'sending'] }, leaseExpiresAt: { lt: now } },
    select: { id: true, tenantId: true, messageId: true, status: true }
  });
  let retryable = 0;
  let unknown = 0;
  for (const row of expired) {
    const target = row.status === 'sending' ? 'unknown' : 'retryable';
    await prisma.$transaction(async (tx) => {
      const changed = await tx.outboxMessage.updateMany({
        where: { id: row.id, status: row.status, leaseExpiresAt: { lt: now } },
        data: {
          status: target,
          ...(target === 'retryable' ? { availableAt: now } : {}),
          leaseExpiresAt: null,
          leasedBy: null,
          lastErrorCode: target === 'unknown' ? 'worker_lost_after_send_started' : 'lease_expired'
        }
      });
      if (changed.count === 0) return;
      const messageTarget = recoveredMessageStatus(target);
      await tx.message.update({
        where: { id: row.messageId },
        data: { status: messageTarget }
      });
      await tx.messageEvent.create({
        data: {
          id: generateUuidV7(),
          tenantId: row.tenantId,
          messageId: row.messageId,
          eventType: target === 'unknown' ? 'delivery.outcome.unknown' : 'outbox.lease.expired',
          fromStatus: row.status,
          toStatus: messageTarget,
          occurredAt: now
        }
      });
      if (target === 'unknown') unknown += 1;
      else retryable += 1;
    });
  }
  return { retryable, unknown };
};

export const deliverOutbox = async (
  prisma: PrismaClient,
  provider: ProviderDelivery,
  job: OutboundDeliveryJob,
  workerId: string,
  now = () => new Date()
) => {
  const startedAt = now();
  const deliveryAttemptId = generateUuidV7();
  const leaseExpiresAt = new Date(startedAt.getTime() + OUTBOX_LEASE_MS);
  const claimed = await prisma.$transaction(async (tx) => {
    const outbox = await tx.outboxMessage.findFirst({
      where: {
        id: job.outboxMessageId,
        tenantId: job.tenantId,
        status: { in: ['queued', 'retryable'] },
        availableAt: { lte: startedAt }
      },
      include: { message: { include: { conversation: { include: { contact: true } } } } }
    });
    if (!outbox) return null;
    const changed = await tx.outboxMessage.updateMany({
      where: { id: outbox.id, status: outbox.status, availableAt: { lte: startedAt } },
      data: {
        status: 'leased',
        attemptCount: { increment: 1 },
        leaseExpiresAt,
        leasedBy: workerId,
        deliveryAttemptId,
        dispatchedAt: startedAt
      }
    });
    if (changed.count === 0) return null;
    await tx.message.update({ where: { id: outbox.messageId }, data: { status: 'leased' } });
    await tx.messageEvent.create({
      data: {
        id: generateUuidV7(),
        tenantId: job.tenantId,
        messageId: outbox.messageId,
        eventType: 'outbox.leased',
        fromStatus: outbox.status,
        toStatus: 'leased',
        safeMetadata: { deliveryAttemptId, workerId },
        occurredAt: startedAt
      }
    });
    return { ...outbox, attemptCount: outbox.attemptCount + 1 };
  });
  if (!claimed) return { status: 'noop' as const };

  const recipientJid = claimed.message.conversation.contact.providerJid;
  if (
    claimed.message.conversation.channel !== 'whatsapp' ||
    !recipientJid ||
    !providerJidSchema.safeParse(recipientJid).success
  ) {
    await failBeforeAcceptance(prisma, claimed, 'unsafe_recipient', now());
    return { status: 'failed' as const, reason: 'unsafe_recipient' };
  }
  const wa = await prisma.whatsAppSessionState.findUnique({ where: { tenantId: job.tenantId } });
  if (wa?.state !== 'connected') {
    await failBeforeAcceptance(prisma, claimed, 'whatsapp_not_connected', now());
    return { status: 'deferred' as const, reason: 'whatsapp_not_connected' };
  }

  // A queued answer can become obsolete while CS is replying from the phone/dashboard.
  const superseded = await prisma.message.findFirst({
    where: {
      id: claimed.messageId,
      tenantId: job.tenantId,
      source: { in: ['ai', 'rule'] },
      events: { none: { eventType: 'handoff.notification.created' } },
      conversation: {
        messages: {
          some: {
            direction: 'outgoing',
            source: 'manual',
            status: { notIn: ['failed', 'cancelled'] },
            occurredAt: { gte: claimed.message.occurredAt }
          }
        }
      }
    },
    select: { id: true }
  });
  if (superseded) {
    const cancelledAt = now();
    await prisma.$transaction(async (tx) => {
      await tx.outboxMessage.update({
        where: { id: claimed.id },
        data: {
          status: 'cancelled',
          completedAt: cancelledAt,
          leaseExpiresAt: null,
          leasedBy: null,
          lastErrorCode: 'cs_replied'
        }
      });
      await tx.message.update({ where: { id: claimed.messageId }, data: { status: 'cancelled' } });
      await tx.messageEvent.create({
        data: {
          id: generateUuidV7(),
          tenantId: job.tenantId,
          messageId: claimed.messageId,
          eventType: 'automation.cancelled',
          fromStatus: 'leased',
          toStatus: 'cancelled',
          safeMetadata: { reason: 'cs_replied' },
          occurredAt: cancelledAt
        }
      });
    });
    return { status: 'noop' as const };
  }

  const sendingAt = now();
  await prisma.$transaction(async (tx) => {
    await tx.outboxMessage.update({ where: { id: claimed.id }, data: { status: 'sending' } });
    await tx.message.update({ where: { id: claimed.messageId }, data: { status: 'sending' } });
    await tx.messageEvent.create({
      data: {
        id: generateUuidV7(),
        tenantId: job.tenantId,
        messageId: claimed.messageId,
        eventType: 'provider.send.started',
        fromStatus: 'leased',
        toStatus: 'sending',
        safeMetadata: { deliveryAttemptId },
        occurredAt: sendingAt
      }
    });
  });

  try {
    const result = await provider.send({
      tenantId: job.tenantId,
      outboxMessageId: claimed.id,
      deliveryAttemptId,
      recipientJid,
      content: claimed.message.content
    });
    const completedAt = now();
    await prisma.$transaction(async (tx) => {
      await tx.outboxMessage.update({
        where: { id: claimed.id },
        data: {
          status: 'sent',
          completedAt,
          leaseExpiresAt: null,
          leasedBy: null,
          lastErrorCode: null
        }
      });
      await tx.message.update({
        where: { id: claimed.messageId },
        data: { status: 'sent', providerMessageId: result.providerMessageId }
      });
      await tx.messageEvent.create({
        data: {
          id: generateUuidV7(),
          tenantId: job.tenantId,
          messageId: claimed.messageId,
          eventType: 'provider.send.accepted',
          fromStatus: 'sending',
          toStatus: 'sent',
          safeMetadata: { deliveryAttemptId },
          occurredAt: completedAt
        }
      });
      await tx.contact.update({
        where: { id: claimed.message.conversation.contact.id },
        data: { lastOutboundAt: completedAt }
      });
    });
    return { status: 'delivered' as const, providerMessageId: result.providerMessageId };
  } catch (error) {
    const failedAt = now();
    if (error instanceof NotAcceptedDeliveryError) {
      await failBeforeAcceptance(prisma, claimed, error.code, failedAt);
      return { status: 'deferred' as const, reason: error.code };
    }
    await prisma.$transaction(async (tx) => {
      await tx.outboxMessage.update({
        where: { id: claimed.id },
        data: {
          status: 'unknown',
          completedAt: failedAt,
          leaseExpiresAt: null,
          leasedBy: null,
          lastErrorCode: 'provider_outcome_uncertain'
        }
      });
      await tx.message.update({ where: { id: claimed.messageId }, data: { status: 'unknown' } });
      await tx.messageEvent.create({
        data: {
          id: generateUuidV7(),
          tenantId: job.tenantId,
          messageId: claimed.messageId,
          eventType: 'delivery.outcome.unknown',
          fromStatus: 'sending',
          toStatus: 'unknown',
          safeMetadata: { deliveryAttemptId, errorCode: 'provider_outcome_uncertain' },
          occurredAt: failedAt
        }
      });
    });
    return { status: 'unknown' as const };
  }
};

const failBeforeAcceptance = async (
  prisma: PrismaClient,
  claimed: {
    id: string;
    tenantId: string;
    messageId: string;
    attemptCount: number;
    maxAttempts: number;
    status: string;
  },
  code: string,
  failedAt: Date
) => {
  const exhausted = claimed.attemptCount >= claimed.maxAttempts || code === 'unsafe_recipient';
  const target = exhausted ? 'failed' : 'retryable';
  await prisma.$transaction(async (tx) => {
    await tx.outboxMessage.update({
      where: { id: claimed.id },
      data: {
        status: target,
        availableAt: exhausted
          ? failedAt
          : new Date(failedAt.getTime() + nextBackoff(claimed.attemptCount)),
        leaseExpiresAt: null,
        leasedBy: null,
        lastErrorCode: code,
        completedAt: exhausted ? failedAt : null
      }
    });
    await tx.message.update({
      where: { id: claimed.messageId },
      data: { status: target === 'retryable' ? 'queued' : 'failed' }
    });
    await tx.messageEvent.create({
      data: {
        id: generateUuidV7(),
        tenantId: claimed.tenantId,
        messageId: claimed.messageId,
        eventType: exhausted ? 'delivery.failed' : 'delivery.retry.scheduled',
        fromStatus: 'leased',
        toStatus: exhausted ? 'failed' : 'queued',
        safeMetadata: { errorCode: code, attempt: claimed.attemptCount },
        occurredAt: failedAt
      }
    });
  });
};

const readInternalToken = (): string => {
  const path = process.env.WHATSAPP_INTERNAL_TOKEN_FILE;
  if (!path) throw new Error('WHATSAPP_INTERNAL_TOKEN_FILE is required');
  const token = readFileSync(path, 'utf8').trim();
  if (token.length < 48) throw new Error('WhatsApp internal token is too short');
  return token;
};

export class InternalWhatsAppDelivery implements ProviderDelivery {
  private readonly token = readInternalToken();

  public constructor(
    private readonly endpoint = process.env.WHATSAPP_SEND_INTERNAL_URL ??
      'http://whatsapp:4020/internal/v1/send'
  ) {}

  public async send(input: Parameters<ProviderDelivery['send']>[0]) {
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(15_000)
      });
    } catch {
      throw new Error('provider_outcome_uncertain');
    }
    if (response.status === 409 || response.status === 400) {
      throw new NotAcceptedDeliveryError(
        response.status === 409 ? 'whatsapp_not_connected' : 'provider_rejected'
      );
    }
    if (!response.ok) throw new Error('provider_outcome_uncertain');
    return internalOutboundSendResponseSchema.parse(await response.json());
  }
}
