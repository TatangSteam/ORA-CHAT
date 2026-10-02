import { z } from 'zod';

import { messageTemplateSelectionSchema } from './templates.js';

export const messageStatusSchema = z.enum([
  'received',
  'draft',
  'scheduled',
  'queued',
  'leased',
  'sending',
  'sent',
  'failed',
  'unknown',
  'cancelled'
]);
export const outboxStatusSchema = z.enum([
  'queued',
  'leased',
  'sending',
  'sent',
  'retryable',
  'failed',
  'unknown',
  'cancelled'
]);
export const messageSourceSchema = z.enum(['provider', 'manual', 'rule', 'ai']);
export const conversationChannelSchema = z.enum(['whatsapp', 'playground']);
export const conversationStatusSchema = z.enum(['open', 'closed', 'archived']);
export const handlingModeSchema = z.enum(['bot', 'human']);
export const handoffStatusSchema = z.enum(['open', 'assigned', 'resolved', 'cancelled']);
export const handoffPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

export const normalizedPhoneSchema = z.string().regex(/^62[0-9]{7,13}$/u);
export const providerJidSchema = z.string().regex(/^62[0-9]{7,13}@s\.whatsapp\.net$/u);

export const normalizeIndonesianPhone = (untrusted: string): string => {
  const compact = untrusted.trim().replace(/[\s().-]/gu, '');
  const digits = compact.startsWith('+') ? compact.slice(1) : compact;
  const normalized = digits.startsWith('08')
    ? `62${digits.slice(1)}`
    : digits.startsWith('8')
      ? `62${digits}`
      : digits;
  return normalizedPhoneSchema.parse(normalized);
};

export const maskPhone = (phone: string): string =>
  phone.length <= 7 ? '••••' : `${phone.slice(0, 4)}••••${phone.slice(-3)}`;

export const contactCreateRequestSchema = z
  .object({
    phone: z.string().min(8).max(32),
    displayName: z.string().trim().min(1).max(160).optional(),
    consentStatus: z.enum(['unknown', 'opted_in', 'opted_out']).default('unknown')
  })
  .strict();

export const contactListQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(160).optional()
  })
  .strict();

export const conversationListQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(160).optional(),
    status: conversationStatusSchema.optional(),
    unread: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional()
  })
  .strict();

export const messageListQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
  .strict();

export const createMessageRequestSchema = z
  .object({
    contactId: z.uuid().optional(),
    phone: z.string().min(8).max(32).optional(),
    displayName: z.string().trim().min(1).max(160).optional(),
    content: z.string().trim().min(1).max(4096).optional(),
    template: messageTemplateSelectionSchema.optional(),
    replyToMessageId: z.uuid().optional(),
    scheduledAt: z.iso.datetime().optional()
  })
  .strict()
  .refine((value) => Number(Boolean(value.contactId)) + Number(Boolean(value.phone)) === 1, {
    message: 'Exactly one of contactId or phone is required'
  })
  .refine((value) => Number(Boolean(value.content)) + Number(Boolean(value.template)) === 1, {
    message: 'Exactly one of content or template is required'
  });

export const inboundProviderEventSchema = z
  .object({
    tenantId: z.uuid(),
    providerEventId: z.string().min(1).max(191),
    providerMessageId: z.string().min(1).max(191),
    senderJid: providerJidSchema,
    fromMe: z.boolean().optional(),
    displayName: z.string().trim().min(1).max(160).optional(),
    content: z.string().trim().min(1).max(4096),
    occurredAt: z.iso.datetime()
  })
  .strict();

export const internalOutboundSendRequestSchema = z
  .object({
    tenantId: z.uuid(),
    outboxMessageId: z.uuid(),
    deliveryAttemptId: z.uuid(),
    recipientJid: providerJidSchema,
    content: z.string().min(1).max(4096)
  })
  .strict();

export const internalWhatsAppPresenceRequestSchema = z
  .object({
    tenantId: z.uuid(),
    recipientJid: providerJidSchema,
    state: z.enum(['composing', 'paused'])
  })
  .strict();

export const internalOutboundSendResponseSchema = z
  .object({ providerMessageId: z.string().min(1).max(191) })
  .strict();

export const outboxMutationRequestSchema = z
  .object({ reason: z.string().trim().min(8).max(500) })
  .strict();

export const outboxListQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    status: outboxStatusSchema.optional()
  })
  .strict();

export const outboxReconcileRequestSchema = z
  .object({
    reason: z.string().trim().min(8).max(500),
    outcome: z.enum(['sent', 'failed'])
  })
  .strict();

export const handoffCreateRequestSchema = z
  .object({
    conversationId: z.uuid(),
    triggerMessageId: z.uuid().optional(),
    reasonCode: z.string().trim().min(2).max(64),
    priority: handoffPrioritySchema.default('normal')
  })
  .strict();

export const handoffListQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    status: handoffStatusSchema.optional()
  })
  .strict();

export const handoffAssignRequestSchema = z
  .object({ assigneeUserId: z.uuid(), reason: z.string().trim().min(8).max(500) })
  .strict();

export const handoffResolveRequestSchema = z
  .object({ resolutionNote: z.string().trim().min(8).max(1000) })
  .strict();

export const handoffNotificationUpdateRequestSchema = z
  .object({
    phone: z
      .string()
      .trim()
      .min(8)
      .max(32)
      .refine((value) => {
        try {
          normalizeIndonesianPhone(value);
          return true;
        } catch {
          return false;
        }
      }, 'Nomor WhatsApp Indonesia tidak valid')
      .nullable(),
    enabled: z.boolean(),
    expectedRevision: z.number().int().nonnegative(),
    reason: z.string().trim().min(8).max(500)
  })
  .strict()
  .refine((value) => !value.enabled || value.phone !== null, {
    message: 'Nomor CS wajib diisi saat notifikasi diaktifkan',
    path: ['phone']
  });

export const chatbotRuleInputSchema = z
  .object({
    sequence: z.number().int().min(0).max(1000),
    name: z.string().trim().min(1).max(160),
    triggerType: z.enum(['exact', 'contains', 'starts_with', 'fallback']),
    trigger: z.string().trim().max(500),
    response: z.string().trim().min(1).max(4096),
    enabled: z.boolean().default(true)
  })
  .strict();

export const chatbotConfigRequestSchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    greeting: z.string().trim().max(4096).nullable().optional(),
    fallback: z.string().trim().min(1).max(4096),
    rules: z.array(chatbotRuleInputSchema).max(100)
  })
  .strict()
  .refine(
    (value) => new Set(value.rules.map(({ sequence }) => sequence)).size === value.rules.length,
    {
      message: 'Rule sequence must be unique'
    }
  );

export const chatbotTestRequestSchema = z
  .object({ input: z.string().trim().min(1).max(4096), versionId: z.uuid().optional() })
  .strict();

export const chatbotPublishRequestSchema = z
  .object({ expectedRevision: z.number().int().min(0), reason: z.string().trim().min(8).max(500) })
  .strict();

export type MessageStatus = z.infer<typeof messageStatusSchema>;
export type OutboxStatus = z.infer<typeof outboxStatusSchema>;
export type MessageSource = z.infer<typeof messageSourceSchema>;
export type InboundProviderEvent = z.infer<typeof inboundProviderEventSchema>;
export type ChatbotRuleInput = z.infer<typeof chatbotRuleInputSchema>;
