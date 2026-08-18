import type {
  ChatbotRuleInput,
  MessageSource,
  MessageTemplateSelection,
  TemplateVariableName
} from '@raho/contracts';
import { maskPhone, normalizeIndonesianPhone, providerJidSchema } from '@raho/contracts';
import { generateUuidV7, type Prisma, type PrismaClient } from '@raho/db';
import { deterministicJobId } from '@raho/queue';
import { renderMessageTemplate } from './template-repository.js';

const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const page = <T extends { id: string }>(rows: T[], limit: number) => {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
};

const isUniqueConflict = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';

export interface OutboundCreateInput {
  tenantId: string;
  actorUserId: string;
  idempotencyKey: string;
  requestHash: string;
  contactId?: string | undefined;
  phone?: string | undefined;
  displayName?: string | undefined;
  content?: string | undefined;
  template?: MessageTemplateSelection | undefined;
  replyToMessageId?: string | undefined;
  scheduledAt?: Date | undefined;
  source: MessageSource;
  requestId: string;
  now: Date;
}

export interface OutboundCreateResult {
  messageId: string;
  outboxMessageId: string;
  status: 'queued' | 'scheduled';
  replayed: boolean;
}

export interface InboundInput {
  tenantId: string;
  providerEventId: string;
  providerMessageId: string;
  senderJid: string;
  displayName?: string | undefined;
  content: string;
  occurredAt: Date;
  requestId: string;
}

export interface InboundResult {
  messageId: string;
  conversationId: string;
  duplicate: boolean;
  automationAllowed: boolean;
  ruleOutboxMessageId: string | null;
  automationFallback: string | null;
}

export interface AutomatedInboundResponseResult {
  messageId: string;
  outboxMessageId: string;
  handoffTaskId: string | null;
}

const publicContact = (contact: {
  id: string;
  displayName: string | null;
  normalizedPhone: string;
  providerJid: string | null;
  consentStatus: string;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  ...contact,
  maskedPhone: maskPhone(contact.normalizedPhone)
});

const matchRule = (
  input: string,
  rules: Array<{
    triggerType: string;
    triggerConfig: unknown;
    responseConfig: unknown;
    enabled: boolean;
  }>
): string | null => {
  const candidate = input.trim().toLocaleLowerCase('id-ID');
  for (const rule of rules) {
    if (!rule.enabled || rule.triggerType === 'fallback') continue;
    const trigger =
      typeof rule.triggerConfig === 'object' &&
      rule.triggerConfig !== null &&
      'value' in rule.triggerConfig &&
      typeof rule.triggerConfig.value === 'string'
        ? rule.triggerConfig.value.trim().toLocaleLowerCase('id-ID')
        : '';
    const matches =
      (rule.triggerType === 'exact' && candidate === trigger) ||
      (rule.triggerType === 'contains' && candidate.includes(trigger)) ||
      (rule.triggerType === 'starts_with' && candidate.startsWith(trigger));
    if (!matches) continue;
    return typeof rule.responseConfig === 'object' &&
      rule.responseConfig !== null &&
      'text' in rule.responseConfig &&
      typeof rule.responseConfig.text === 'string'
      ? rule.responseConfig.text
      : null;
  }
  return null;
};

export class PrismaMessagingRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async recentConversationContext(
    tenantId: string,
    conversationId: string,
    excludeMessageId: string,
    limit = 5
  ): Promise<Array<{ role: 'customer' | 'assistant'; content: string }>> {
    const rows = await this.prisma.message.findMany({
      where: {
        tenantId,
        conversationId,
        id: { not: excludeMessageId },
        status: { notIn: ['failed', 'cancelled'] }
      },
      select: { direction: true, content: true },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: Math.min(5, Math.max(0, limit))
    });
    return rows.reverse().map((message) => ({
      role: message.direction === 'incoming' ? 'customer' : 'assistant',
      content: message.content.slice(0, 800)
    }));
  }

  public async listContacts(
    tenantId: string,
    query: { cursor?: string | undefined; limit: number; search?: string | undefined }
  ) {
    const rows = await this.prisma.contact.findMany({
      where: {
        tenantId,
        ...(query.search
          ? {
              OR: [
                { displayName: { contains: query.search, mode: 'insensitive' as const } },
                { normalizedPhone: { contains: query.search.replace(/\D/gu, '') } }
              ]
            }
          : {})
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    const result = page(rows, query.limit);
    return { ...result, items: result.items.map(publicContact) };
  }

  public async getContact(tenantId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id, tenantId } });
    return contact ? publicContact(contact) : null;
  }

  public async createContact(
    tenantId: string,
    input: { phone: string; displayName?: string | undefined; consentStatus: string }
  ) {
    const normalizedPhone = normalizeIndonesianPhone(input.phone);
    const providerJid = `${normalizedPhone}@s.whatsapp.net`;
    const existing = await this.prisma.contact.findUnique({
      where: { tenantId_normalizedPhone: { tenantId, normalizedPhone } }
    });
    if (existing) return { contact: publicContact(existing), created: false };
    const contact = await this.prisma.contact.create({
      data: {
        id: generateUuidV7(),
        tenantId,
        normalizedPhone,
        providerJid,
        ...(input.displayName ? { displayName: input.displayName } : {}),
        consentStatus: input.consentStatus
      }
    });
    return { contact: publicContact(contact), created: true };
  }

  public async listConversations(
    tenantId: string,
    query: {
      cursor?: string | undefined;
      limit: number;
      search?: string | undefined;
      status?: string | undefined;
      unread?: boolean | undefined;
    }
  ) {
    const rows = await this.prisma.conversation.findMany({
      where: {
        tenantId,
        channel: 'whatsapp',
        ...(query.status ? { status: query.status } : {}),
        ...(query.unread === undefined ? {} : { unreadCount: query.unread ? { gt: 0 } : 0 }),
        ...(query.search
          ? {
              contact: {
                OR: [
                  { displayName: { contains: query.search, mode: 'insensitive' as const } },
                  { normalizedPhone: { contains: query.search.replace(/\D/gu, '') } }
                ]
              }
            }
          : {})
      },
      include: {
        contact: true,
        messages: { orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 1 },
        handoffTasks: {
          where: { status: { in: ['open', 'assigned'] } },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    const result = page(rows, query.limit);
    return {
      ...result,
      items: result.items.map(({ contact, messages, handoffTasks, ...conversation }) => ({
        ...conversation,
        contact: publicContact(contact),
        lastMessage: messages[0] ?? null,
        activeHandoff: handoffTasks[0] ?? null
      }))
    };
  }

  public async listMessages(
    tenantId: string,
    conversationId: string,
    query: { cursor?: string | undefined; limit: number }
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId, channel: 'whatsapp' },
      include: { contact: true }
    });
    if (!conversation) return null;
    const rows = await this.prisma.message.findMany({
      where: { tenantId, conversationId },
      include: {
        events: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] },
        outbox: true,
        templateSnapshot: { include: { checklistItems: { orderBy: { sequence: 'asc' } } } }
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    return {
      conversation: { ...conversation, contact: publicContact(conversation.contact) },
      ...page(rows, query.limit)
    };
  }

  public async getMessage(tenantId: string, id: string) {
    return this.prisma.message.findFirst({
      where: { id, tenantId },
      include: {
        conversation: { include: { contact: true } },
        events: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] },
        outbox: true,
        templateSnapshot: { include: { checklistItems: { orderBy: { sequence: 'asc' } } } }
      }
    });
  }

  private async replayOutbound(
    tenantId: string,
    idempotencyKey: string,
    requestHash: string
  ): Promise<OutboundCreateResult | null> {
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { tenantId_scope_key: { tenantId, scope: 'message.create', key: idempotencyKey } }
    });
    if (!existing) return null;
    if (existing.requestHash !== requestHash) throw new Error('IDEMPOTENCY_CONFLICT');
    const snapshot = existing.responseSnapshot as unknown as Omit<OutboundCreateResult, 'replayed'>;
    return { ...snapshot, replayed: true };
  }

  public async createOutbound(input: OutboundCreateInput): Promise<OutboundCreateResult> {
    const replay = await this.replayOutbound(
      input.tenantId,
      input.idempotencyKey,
      input.requestHash
    );
    if (replay) return replay;
    try {
      return await this.prisma.$transaction(async (tx) => {
        let contact;
        if (input.contactId) {
          contact = await tx.contact.findFirst({
            where: { id: input.contactId, tenantId: input.tenantId }
          });
          if (!contact) throw new Error('CONTACT_NOT_FOUND');
        } else {
          const normalizedPhone = normalizeIndonesianPhone(input.phone!);
          const providerJid = providerJidSchema.parse(`${normalizedPhone}@s.whatsapp.net`);
          contact = await tx.contact.upsert({
            where: { tenantId_normalizedPhone: { tenantId: input.tenantId, normalizedPhone } },
            create: {
              id: generateUuidV7(),
              tenantId: input.tenantId,
              normalizedPhone,
              providerJid,
              ...(input.displayName ? { displayName: input.displayName } : {})
            },
            update: input.displayName
              ? { displayName: input.displayName, providerJid }
              : { providerJid }
          });
        }
        if (!contact.providerJid || !providerJidSchema.safeParse(contact.providerJid).success) {
          throw new Error('UNSAFE_RECIPIENT');
        }
        if (contact.consentStatus === 'opted_out') throw new Error('RECIPIENT_OPTED_OUT');
        const conversation = await tx.conversation.upsert({
          where: {
            tenantId_contactId_channel: {
              tenantId: input.tenantId,
              contactId: contact.id,
              channel: 'whatsapp'
            }
          },
          create: {
            id: generateUuidV7(),
            tenantId: input.tenantId,
            contactId: contact.id,
            channel: 'whatsapp'
          },
          update: { status: 'open' }
        });
        if (input.replyToMessageId) {
          const reply = await tx.message.findFirst({
            where: {
              id: input.replyToMessageId,
              tenantId: input.tenantId,
              conversationId: conversation.id
            },
            select: { id: true }
          });
          if (!reply) throw new Error('REPLY_NOT_FOUND');
        }
        let content = input.content;
        let templateSnapshot:
          | {
              create: {
                id: string;
                tenantId: string;
                sourceTemplateVersionId: string;
                renderedBody: string;
                resolvedVariables: Prisma.InputJsonValue;
                checklistItems: {
                  create: Array<{
                    id: string;
                    tenantId: string;
                    sourceChecklistItemId: string;
                    sequence: number;
                    label: string;
                    required: boolean;
                    checked: boolean;
                    checkedByUserId?: string;
                    checkedAt?: Date;
                  }>;
                };
              };
            }
          | undefined;
        if (input.template) {
          const version = await tx.messageTemplateVersion.findFirst({
            where: {
              id: input.template.templateVersionId,
              tenantId: input.tenantId,
              status: 'published',
              template: { status: 'active' }
            },
            include: { checklistItems: { orderBy: { sequence: 'asc' } } }
          });
          if (!version) throw new Error('TEMPLATE_VERSION_NOT_ACTIVE');
          const checks = new Map<string, boolean>();
          for (const item of input.template.checklist) {
            if (checks.has(item.itemId)) throw new Error('TEMPLATE_CHECKLIST_INVALID');
            checks.set(item.itemId, item.checked);
          }
          if (
            checks.size !== version.checklistItems.length ||
            [...checks.keys()].some(
              (id) => !version.checklistItems.some((source) => source.id === id)
            )
          ) {
            throw new Error('TEMPLATE_CHECKLIST_INVALID');
          }
          if (version.checklistItems.some((item) => item.required && !checks.get(item.id))) {
            throw new Error('TEMPLATE_CHECKLIST_REQUIRED');
          }
          content = renderMessageTemplate(
            version.body,
            version.variableSchema as TemplateVariableName[],
            input.template.variables,
            version.checklistItems,
            checks
          );
          templateSnapshot = {
            create: {
              id: generateUuidV7(),
              tenantId: input.tenantId,
              sourceTemplateVersionId: version.id,
              renderedBody: content,
              resolvedVariables: input.template.variables,
              checklistItems: {
                create: version.checklistItems.map((item) => {
                  const checked = checks.get(item.id) === true;
                  return {
                    id: generateUuidV7(),
                    tenantId: input.tenantId,
                    sourceChecklistItemId: item.id,
                    sequence: item.sequence,
                    label: item.label,
                    required: item.required,
                    checked,
                    ...(checked ? { checkedByUserId: input.actorUserId, checkedAt: input.now } : {})
                  };
                })
              }
            }
          };
        }
        if (!content) throw new Error('MESSAGE_CONTENT_REQUIRED');
        const scheduledAt = input.scheduledAt ?? input.now;
        const initialStatus = scheduledAt > input.now ? 'scheduled' : 'queued';
        const messageId = generateUuidV7();
        const outboxMessageId = generateUuidV7();
        const jobId = deterministicJobId('outbound.delivery', input.tenantId, outboxMessageId);
        await tx.message.create({
          data: {
            id: messageId,
            tenantId: input.tenantId,
            conversationId: conversation.id,
            ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
            direction: 'outgoing',
            source: input.source,
            content,
            status: initialStatus,
            occurredAt: input.now,
            events: {
              create: {
                id: generateUuidV7(),
                tenantId: input.tenantId,
                eventType: 'message.created',
                toStatus: initialStatus,
                safeMetadata: {
                  source: input.source,
                  ...(input.template ? { templateVersionId: input.template.templateVersionId } : {})
                },
                occurredAt: input.now
              }
            },
            outbox: {
              create: {
                id: outboxMessageId,
                tenantId: input.tenantId,
                status: 'queued',
                deterministicJobId: jobId,
                availableAt: scheduledAt
              }
            },
            ...(templateSnapshot ? { templateSnapshot } : {})
          }
        });
        await tx.contact.update({
          where: { id: contact.id },
          data: { lastOutboundAt: input.now }
        });
        await tx.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: input.now }
        });
        const snapshot = {
          messageId,
          outboxMessageId,
          status: initialStatus as 'queued' | 'scheduled'
        };
        await tx.idempotencyKey.create({
          data: {
            id: generateUuidV7(),
            tenantId: input.tenantId,
            scope: 'message.create',
            key: input.idempotencyKey,
            requestHash: input.requestHash,
            resourceType: 'Message',
            resourceId: messageId,
            responseStatus: 202,
            responseSnapshot: snapshot,
            expiresAt: new Date(input.now.getTime() + IDEMPOTENCY_TTL_MS)
          }
        });
        await tx.auditLog.create({
          data: {
            id: generateUuidV7(),
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            action: 'message.outbound.created',
            entityType: 'Message',
            entityId: messageId,
            requestId: input.requestId,
            metadata: {
              source: input.source,
              outboxMessageId,
              ...(input.template ? { templateVersionId: input.template.templateVersionId } : {})
            }
          }
        });
        return { ...snapshot, replayed: false };
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        const concurrent = await this.replayOutbound(
          input.tenantId,
          input.idempotencyKey,
          input.requestHash
        );
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }

  public async ingestInbound(input: InboundInput): Promise<InboundResult> {
    const duplicate = await this.prisma.message.findFirst({
      where: {
        tenantId: input.tenantId,
        OR: [
          { providerMessageId: input.providerMessageId },
          { events: { some: { providerEventId: input.providerEventId } } }
        ]
      },
      select: { id: true, conversationId: true }
    });
    if (duplicate) {
      return {
        messageId: duplicate.id,
        conversationId: duplicate.conversationId,
        duplicate: true,
        automationAllowed: false,
        ruleOutboxMessageId: null,
        automationFallback: null
      };
    }
    const normalizedPhone = normalizeIndonesianPhone(input.senderJid.split('@')[0]!);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const contact = await tx.contact.upsert({
          where: { tenantId_normalizedPhone: { tenantId: input.tenantId, normalizedPhone } },
          create: {
            id: generateUuidV7(),
            tenantId: input.tenantId,
            normalizedPhone,
            providerJid: input.senderJid,
            ...(input.displayName ? { displayName: input.displayName } : {}),
            lastInboundAt: input.occurredAt
          },
          update: {
            providerJid: input.senderJid,
            lastInboundAt: input.occurredAt,
            ...(input.displayName ? { displayName: input.displayName } : {})
          }
        });
        const conversation = await tx.conversation.upsert({
          where: {
            tenantId_contactId_channel: {
              tenantId: input.tenantId,
              contactId: contact.id,
              channel: 'whatsapp'
            }
          },
          create: {
            id: generateUuidV7(),
            tenantId: input.tenantId,
            contactId: contact.id,
            channel: 'whatsapp',
            unreadCount: 1,
            lastMessageAt: input.occurredAt
          },
          update: {
            status: 'open',
            unreadCount: { increment: 1 },
            lastMessageAt: input.occurredAt
          }
        });
        const incoming = await tx.message.create({
          data: {
            id: generateUuidV7(),
            tenantId: input.tenantId,
            conversationId: conversation.id,
            direction: 'incoming',
            source: 'provider',
            content: input.content,
            status: 'received',
            providerMessageId: input.providerMessageId,
            occurredAt: input.occurredAt,
            events: {
              create: {
                id: generateUuidV7(),
                tenantId: input.tenantId,
                eventType: 'provider.message.received',
                toStatus: 'received',
                providerEventId: input.providerEventId,
                occurredAt: input.occurredAt
              }
            }
          }
        });

        let ruleOutboxMessageId: string | null = null;
        let automationFallback: string | null = null;
        if (conversation.handlingMode === 'bot') {
          const version = await tx.chatbotRuleVersion.findFirst({
            where: { tenantId: input.tenantId, status: 'published' },
            include: { rules: { orderBy: { sequence: 'asc' } } }
          });
          if (version) {
            const matchedResponse = matchRule(input.content, version.rules);
            automationFallback = version.fallback;
            if (matchedResponse) {
              const messageId = generateUuidV7();
              ruleOutboxMessageId = generateUuidV7();
              await tx.message.create({
                data: {
                  id: messageId,
                  tenantId: input.tenantId,
                  conversationId: conversation.id,
                  direction: 'outgoing',
                  source: 'rule',
                  content: matchedResponse,
                  status: 'queued',
                  occurredAt: input.occurredAt,
                  events: {
                    create: {
                      id: generateUuidV7(),
                      tenantId: input.tenantId,
                      eventType: 'rule.response.created',
                      toStatus: 'queued',
                      safeMetadata: { ruleVersionId: version.id },
                      occurredAt: input.occurredAt
                    }
                  },
                  outbox: {
                    create: {
                      id: ruleOutboxMessageId,
                      tenantId: input.tenantId,
                      deterministicJobId: deterministicJobId(
                        'outbound.delivery',
                        input.tenantId,
                        ruleOutboxMessageId
                      ),
                      availableAt: input.occurredAt
                    }
                  }
                }
              });
            }
          }
        }
        return {
          messageId: incoming.id,
          conversationId: conversation.id,
          duplicate: false,
          automationAllowed: conversation.handlingMode === 'bot',
          ruleOutboxMessageId,
          automationFallback
        };
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        const existing = await this.prisma.message.findFirst({
          where: { tenantId: input.tenantId, providerMessageId: input.providerMessageId },
          select: { id: true, conversationId: true }
        });
        if (existing) {
          return {
            messageId: existing.id,
            conversationId: existing.conversationId,
            duplicate: true,
            automationAllowed: false,
            ruleOutboxMessageId: null,
            automationFallback: null
          };
        }
      }
      throw error;
    }
  }

  public async createAutomatedInboundResponse(input: {
    tenantId: string;
    conversationId: string;
    triggerMessageId: string;
    content: string;
    shouldHandoff: boolean;
    reasonCode: string;
    traceId: string | null;
    now: Date;
  }): Promise<AutomatedInboundResponseResult | null> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: input.conversationId, tenantId: input.tenantId },
      select: { id: true }
    });
    if (!conversation) return null;
    return this.prisma.$transaction(async (tx) => {
      const messageId = generateUuidV7();
      const outboxMessageId = generateUuidV7();
      let handoffTaskId: string | null = null;
      await tx.message.create({
        data: {
          id: messageId,
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          replyToMessageId: input.triggerMessageId,
          direction: 'outgoing',
          source: 'ai',
          content: input.content.slice(0, 4096),
          status: 'queued',
          occurredAt: input.now,
          events: {
            create: {
              id: generateUuidV7(),
              tenantId: input.tenantId,
              eventType: 'ai.response.created',
              toStatus: 'queued',
              safeMetadata: { traceId: input.traceId, shouldHandoff: input.shouldHandoff },
              occurredAt: input.now
            }
          },
          outbox: {
            create: {
              id: outboxMessageId,
              tenantId: input.tenantId,
              deterministicJobId: deterministicJobId(
                'outbound.delivery',
                input.tenantId,
                outboxMessageId
              ),
              availableAt: input.now
            }
          }
        }
      });
      if (input.shouldHandoff) {
        const existing = await tx.handoffTask.findFirst({
          where: {
            tenantId: input.tenantId,
            conversationId: input.conversationId,
            status: { in: ['open', 'assigned'] }
          },
          select: { id: true }
        });
        if (existing) {
          handoffTaskId = existing.id;
        } else {
          handoffTaskId = generateUuidV7();
          await tx.handoffTask.create({
            data: {
              id: handoffTaskId,
              tenantId: input.tenantId,
              conversationId: input.conversationId,
              triggerMessageId: input.triggerMessageId,
              reasonCode: input.reasonCode,
              priority: input.reasonCode === 'restricted_or_emergency' ? 'urgent' : 'normal'
            }
          });
        }
      }
      await tx.conversation.update({
        where: { id: input.conversationId },
        data: {
          lastMessageAt: input.now,
          ...(input.shouldHandoff ? { followUpRequired: true, handlingMode: 'human' } : {})
        }
      });
      return { messageId, outboxMessageId, handoffTaskId };
    });
  }

  public async listOutbox(
    tenantId: string,
    query: { cursor?: string | undefined; limit: number; status?: string | undefined }
  ) {
    const rows = await this.prisma.outboxMessage.findMany({
      where: { tenantId, ...(query.status ? { status: query.status } : {}) },
      include: { message: { include: { conversation: { include: { contact: true } } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    return page(rows, query.limit);
  }

  public async cancelOutbox(
    tenantId: string,
    actorUserId: string,
    outboxId: string,
    reason: string,
    requestId: string,
    now: Date
  ) {
    return this.prisma.$transaction(async (tx) => {
      const outbox = await tx.outboxMessage.findFirst({ where: { id: outboxId, tenantId } });
      if (!outbox) return 'not_found' as const;
      if (!['queued', 'retryable'].includes(outbox.status)) return 'invalid_state' as const;
      await tx.outboxMessage.update({
        where: { id: outbox.id },
        data: { status: 'cancelled', completedAt: now }
      });
      await tx.message.update({ where: { id: outbox.messageId }, data: { status: 'cancelled' } });
      await tx.messageEvent.create({
        data: {
          id: generateUuidV7(),
          tenantId,
          messageId: outbox.messageId,
          eventType: 'outbox.cancelled',
          fromStatus: outbox.status,
          toStatus: 'cancelled',
          occurredAt: now
        }
      });
      await this.audit(
        tx,
        tenantId,
        actorUserId,
        'outbox.cancelled',
        'OutboxMessage',
        outbox.id,
        requestId,
        reason
      );
      return 'cancelled' as const;
    });
  }

  public async retryOutbox(
    tenantId: string,
    actorUserId: string,
    outboxId: string,
    reason: string,
    requestId: string,
    now: Date
  ) {
    return this.prisma.$transaction(async (tx) => {
      const outbox = await tx.outboxMessage.findFirst({ where: { id: outboxId, tenantId } });
      if (!outbox) return 'not_found' as const;
      if (!['failed', 'retryable'].includes(outbox.status)) return 'invalid_state' as const;
      await tx.outboxMessage.update({
        where: { id: outbox.id },
        data: {
          status: 'queued',
          availableAt: now,
          leaseExpiresAt: null,
          leasedBy: null,
          deliveryAttemptId: null,
          lastErrorCode: null,
          completedAt: null
        }
      });
      await tx.message.update({ where: { id: outbox.messageId }, data: { status: 'queued' } });
      await tx.messageEvent.create({
        data: {
          id: generateUuidV7(),
          tenantId,
          messageId: outbox.messageId,
          eventType: 'outbox.retry.requested',
          fromStatus: outbox.status,
          toStatus: 'queued',
          occurredAt: now
        }
      });
      await this.audit(
        tx,
        tenantId,
        actorUserId,
        'outbox.retry.requested',
        'OutboxMessage',
        outbox.id,
        requestId,
        reason
      );
      return { status: 'queued' as const, outboxMessageId: outbox.id };
    });
  }

  public async reconcileOutbox(
    tenantId: string,
    actorUserId: string,
    outboxId: string,
    outcome: 'sent' | 'failed',
    reason: string,
    requestId: string,
    now: Date
  ) {
    return this.prisma.$transaction(async (tx) => {
      const outbox = await tx.outboxMessage.findFirst({ where: { id: outboxId, tenantId } });
      if (!outbox) return 'not_found' as const;
      if (outbox.status !== 'unknown') return 'invalid_state' as const;
      await tx.outboxMessage.update({
        where: { id: outbox.id },
        data: { status: outcome, completedAt: now, leaseExpiresAt: null }
      });
      await tx.message.update({ where: { id: outbox.messageId }, data: { status: outcome } });
      await tx.messageEvent.create({
        data: {
          id: generateUuidV7(),
          tenantId,
          messageId: outbox.messageId,
          eventType: 'outbox.reconciled',
          fromStatus: 'unknown',
          toStatus: outcome,
          safeMetadata: { manual: true },
          occurredAt: now
        }
      });
      await this.audit(
        tx,
        tenantId,
        actorUserId,
        'outbox.reconciled',
        'OutboxMessage',
        outbox.id,
        requestId,
        reason,
        { outcome }
      );
      return { status: outcome };
    });
  }

  public async listHandoffs(
    tenantId: string,
    query: { cursor?: string | undefined; limit: number; status?: string | undefined }
  ) {
    const rows = await this.prisma.handoffTask.findMany({
      where: { tenantId, ...(query.status ? { status: query.status } : {}) },
      include: {
        conversation: { include: { contact: true } },
        assigneeUser: { select: { id: true, displayName: true } }
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    return page(rows, query.limit);
  }

  public async createHandoff(
    tenantId: string,
    actorUserId: string,
    input: {
      conversationId: string;
      triggerMessageId?: string | undefined;
      reasonCode: string;
      priority: string;
    },
    requestId: string
  ) {
    const existing = await this.prisma.handoffTask.findFirst({
      where: {
        tenantId,
        conversationId: input.conversationId,
        reasonCode: input.reasonCode,
        status: { in: ['open', 'assigned'] }
      }
    });
    if (existing) return { task: existing, created: false };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const conversation = await tx.conversation.findFirst({
          where: { id: input.conversationId, tenantId, channel: 'whatsapp' }
        });
        if (!conversation) throw new Error('CONVERSATION_NOT_FOUND');
        if (input.triggerMessageId) {
          const message = await tx.message.findFirst({
            where: { id: input.triggerMessageId, tenantId, conversationId: conversation.id }
          });
          if (!message) throw new Error('MESSAGE_NOT_FOUND');
        }
        const task = await tx.handoffTask.create({
          data: {
            id: generateUuidV7(),
            tenantId,
            conversationId: conversation.id,
            ...(input.triggerMessageId ? { triggerMessageId: input.triggerMessageId } : {}),
            reasonCode: input.reasonCode,
            priority: input.priority
          }
        });
        await tx.conversation.update({
          where: { id: conversation.id },
          data: { handlingMode: 'human', followUpRequired: true }
        });
        await this.audit(
          tx,
          tenantId,
          actorUserId,
          'handoff.created',
          'HandoffTask',
          task.id,
          requestId,
          input.reasonCode
        );
        return { task, created: true };
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        const concurrent = await this.prisma.handoffTask.findFirst({
          where: {
            tenantId,
            conversationId: input.conversationId,
            reasonCode: input.reasonCode,
            status: { in: ['open', 'assigned'] }
          }
        });
        if (concurrent) return { task: concurrent, created: false };
      }
      throw error;
    }
  }

  public async assignHandoff(
    tenantId: string,
    actorUserId: string,
    taskId: string,
    assigneeUserId: string,
    reason: string,
    requestId: string,
    now: Date
  ) {
    return this.prisma.$transaction(async (tx) => {
      const [task, membership] = await Promise.all([
        tx.handoffTask.findFirst({
          where: { id: taskId, tenantId, status: { in: ['open', 'assigned'] } }
        }),
        tx.adminTenantMembership.findFirst({ where: { tenantId, adminUserId: assigneeUserId } })
      ]);
      if (!task) return 'not_found' as const;
      if (!membership) return 'invalid_assignee' as const;
      const updated = await tx.handoffTask.update({
        where: { id: task.id },
        data: { assigneeUserId, status: 'assigned', assignedAt: now }
      });
      await tx.conversation.update({
        where: { id: task.conversationId },
        data: { ownerUserId: assigneeUserId, handlingMode: 'human' }
      });
      await this.audit(
        tx,
        tenantId,
        actorUserId,
        'handoff.assigned',
        'HandoffTask',
        task.id,
        requestId,
        reason,
        { assigneeUserId }
      );
      return updated;
    });
  }

  public async resolveHandoff(
    tenantId: string,
    actorUserId: string,
    taskId: string,
    resolutionNote: string,
    requestId: string,
    now: Date
  ) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.handoffTask.findFirst({
        where: { id: taskId, tenantId, status: { in: ['open', 'assigned'] } }
      });
      if (!task) return null;
      const updated = await tx.handoffTask.update({
        where: { id: task.id },
        data: { status: 'resolved', resolutionNote, resolvedAt: now }
      });
      const other = await tx.handoffTask.count({
        where: {
          tenantId,
          conversationId: task.conversationId,
          status: { in: ['open', 'assigned'] }
        }
      });
      if (other === 0) {
        await tx.conversation.update({
          where: { id: task.conversationId },
          data: { handlingMode: 'bot', followUpRequired: false, ownerUserId: null }
        });
      }
      await this.audit(
        tx,
        tenantId,
        actorUserId,
        'handoff.resolved',
        'HandoffTask',
        task.id,
        requestId,
        resolutionNote
      );
      return updated;
    });
  }

  public async getRuleConfig(tenantId: string) {
    return this.prisma.chatbotRuleVersion.findFirst({
      where: { tenantId, status: { in: ['draft', 'published'] } },
      include: { rules: { orderBy: { sequence: 'asc' } } },
      orderBy: [{ status: 'asc' }, { version: 'desc' }]
    });
  }

  public async saveRuleDraft(
    tenantId: string,
    actorUserId: string,
    input: {
      expectedRevision: number;
      greeting?: string | null | undefined;
      fallback: string;
      rules: ChatbotRuleInput[];
    },
    requestId: string
  ) {
    return this.prisma.$transaction(async (tx) => {
      let draft = await tx.chatbotRuleVersion.findFirst({
        where: { tenantId, status: 'draft' },
        orderBy: { version: 'desc' }
      });
      if (!draft) {
        if (input.expectedRevision !== 0) return null;
        const latest = await tx.chatbotRuleVersion.aggregate({
          where: { tenantId },
          _max: { version: true }
        });
        draft = await tx.chatbotRuleVersion.create({
          data: {
            id: generateUuidV7(),
            tenantId,
            version: (latest._max.version ?? 0) + 1,
            revision: 0,
            ...(input.greeting !== undefined ? { greeting: input.greeting } : {}),
            fallback: input.fallback,
            createdByUserId: actorUserId
          }
        });
      } else if (draft.revision !== input.expectedRevision) {
        return null;
      }
      const updated = await tx.chatbotRuleVersion.update({
        where: { id: draft.id },
        data: {
          ...(input.greeting !== undefined ? { greeting: input.greeting } : {}),
          fallback: input.fallback,
          revision: { increment: 1 }
        }
      });
      await tx.chatbotRule.deleteMany({ where: { ruleVersionId: draft.id } });
      if (input.rules.length > 0) {
        await tx.chatbotRule.createMany({
          data: input.rules.map((rule) => ({
            id: generateUuidV7(),
            tenantId,
            ruleVersionId: draft!.id,
            sequence: rule.sequence,
            name: rule.name,
            triggerType: rule.triggerType,
            triggerConfig: { value: rule.trigger },
            responseConfig: { text: rule.response },
            enabled: rule.enabled
          }))
        });
      }
      await this.audit(
        tx,
        tenantId,
        actorUserId,
        'chatbot.rule.draft.saved',
        'ChatbotRuleVersion',
        draft.id,
        requestId
      );
      return tx.chatbotRuleVersion.findUnique({
        where: { id: updated.id },
        include: { rules: { orderBy: { sequence: 'asc' } } }
      });
    });
  }

  public async publishRuleVersion(
    tenantId: string,
    actorUserId: string,
    versionId: string,
    expectedRevision: number,
    reason: string,
    requestId: string,
    now: Date
  ) {
    return this.prisma.$transaction(async (tx) => {
      const draft = await tx.chatbotRuleVersion.findFirst({
        where: { id: versionId, tenantId, status: 'draft' }
      });
      if (!draft) return 'not_found' as const;
      if (draft.revision !== expectedRevision) return 'conflict' as const;
      await tx.chatbotRuleVersion.updateMany({
        where: { tenantId, status: 'published' },
        data: { status: 'archived' }
      });
      const published = await tx.chatbotRuleVersion.update({
        where: { id: draft.id },
        data: {
          status: 'published',
          publishedByUserId: actorUserId,
          publishedAt: now,
          revision: { increment: 1 }
        },
        include: { rules: { orderBy: { sequence: 'asc' } } }
      });
      await this.audit(
        tx,
        tenantId,
        actorUserId,
        'chatbot.rule.published',
        'ChatbotRuleVersion',
        draft.id,
        requestId,
        reason,
        { version: draft.version }
      );
      return published;
    });
  }

  public async testRules(tenantId: string, input: string, versionId?: string | undefined) {
    const version = await this.prisma.chatbotRuleVersion.findFirst({
      where: { tenantId, ...(versionId ? { id: versionId } : { status: 'published' }) },
      include: { rules: { orderBy: { sequence: 'asc' } } },
      orderBy: { version: 'desc' }
    });
    if (!version) return null;
    const response = matchRule(input, version.rules);
    return {
      versionId: version.id,
      version: version.version,
      matched: response !== null,
      response: response ?? version.fallback
    };
  }

  public async metrics(tenantId: string) {
    const [inbound, outbound, failed, pending, handoffs] = await Promise.all([
      this.prisma.message.count({ where: { tenantId, direction: 'incoming' } }),
      this.prisma.message.count({ where: { tenantId, direction: 'outgoing' } }),
      this.prisma.message.count({ where: { tenantId, status: 'failed' } }),
      this.prisma.outboxMessage.count({
        where: { tenantId, status: { in: ['queued', 'leased', 'sending', 'retryable', 'unknown'] } }
      }),
      this.prisma.handoffTask.count({ where: { tenantId, status: { in: ['open', 'assigned'] } } })
    ]);
    return { inbound, outbound, failed, pending, handoffs };
  }

  private async audit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    requestId: string,
    reason?: string,
    metadata: Record<string, unknown> = {}
  ) {
    await tx.auditLog.create({
      data: {
        id: generateUuidV7(),
        tenantId,
        actorUserId,
        action,
        entityType,
        entityId,
        requestId,
        ...(reason ? { reason } : {}),
        metadata: metadata as Prisma.InputJsonValue
      }
    });
  }
}
