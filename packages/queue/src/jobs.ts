import { createHash } from 'node:crypto';
import { z } from 'zod';

export const systemProbeJobSchema = z
  .object({
    kind: z.literal('system.probe'),
    probeId: z.string().min(1).max(120),
    enqueuedAt: z.iso.datetime()
  })
  .strict();

export const outboundDeliveryJobSchema = z
  .object({
    kind: z.literal('outbound.delivery'),
    tenantId: z.uuid(),
    outboxMessageId: z.uuid()
  })
  .strict();

export const knowledgeDocumentJobSchema = z
  .object({
    kind: z.literal('knowledge.document.process'),
    tenantId: z.uuid(),
    documentId: z.uuid()
  })
  .strict();

export const knowledgeReindexJobSchema = z
  .object({
    kind: z.literal('knowledge.reindex'),
    tenantId: z.uuid(),
    generation: z.number().int().min(1)
  })
  .strict();

export const queueJobSchema = z.discriminatedUnion('kind', [
  systemProbeJobSchema,
  outboundDeliveryJobSchema,
  knowledgeDocumentJobSchema,
  knowledgeReindexJobSchema
]);

export type QueueJob = z.infer<typeof queueJobSchema>;
export type SystemProbeJob = z.infer<typeof systemProbeJobSchema>;
export type OutboundDeliveryJob = z.infer<typeof outboundDeliveryJobSchema>;
export type KnowledgeDocumentJob = z.infer<typeof knowledgeDocumentJobSchema>;
export type KnowledgeReindexJob = z.infer<typeof knowledgeReindexJobSchema>;

export const deterministicJobId = (
  kind: QueueJob['kind'],
  tenantOrScope: string,
  logicalId: string
): string => {
  const digest = createHash('sha256')
    .update(`${kind}\0${tenantOrScope}\0${logicalId}`, 'utf8')
    .digest('hex');
  return `${kind.replaceAll('.', '-')}-${digest}`;
};
