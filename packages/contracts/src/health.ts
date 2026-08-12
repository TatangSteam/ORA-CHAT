import { z } from 'zod';

export const serviceNameSchema = z.enum(['api', 'web', 'worker', 'whatsapp']);

export const healthResponseSchema = z
  .object({
    service: serviceNameSchema,
    status: z.literal('live')
  })
  .strict();

export const readinessResponseSchema = z
  .object({
    service: serviceNameSchema,
    status: z.enum(['ready', 'not_ready']),
    checkedAt: z.iso.datetime()
  })
  .strict();

export type ServiceName = z.infer<typeof serviceNameSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
