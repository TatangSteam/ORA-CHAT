import { z } from 'zod';

export const serviceNameSchema = z.enum(['api', 'web', 'worker', 'whatsapp']);

export const healthResponseSchema = z.object({
  service: serviceNameSchema,
  status: z.literal('live')
});

export type ServiceName = z.infer<typeof serviceNameSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
