import { z } from 'zod';

export const requestMetaSchema = z.object({
  requestId: z.string().min(1).max(80),
  traceId: z.string().min(1).max(80).optional(),
  timestamp: z.iso.datetime()
});

export const errorBodySchema = z.object({
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(500),
  details: z.unknown().optional()
});

export const errorEnvelopeSchema = z.object({
  error: errorBodySchema,
  meta: requestMetaSchema
});

export const successEnvelopeSchema = <T extends z.ZodType>(data: T) =>
  z.object({ data, meta: requestMetaSchema });

export const cursorPageMetaSchema = requestMetaSchema.extend({
  nextCursor: z.string().max(500).nullable(),
  hasMore: z.boolean()
});

export const cursorPaginationQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
  .strict();

export type RequestMeta = z.infer<typeof requestMetaSchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
