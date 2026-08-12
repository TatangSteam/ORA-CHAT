import { z } from 'zod';

import { riskLevelSchema } from './domain.js';

export const dependencyNameSchema = z.enum([
  'database',
  'redis',
  'worker',
  'minio',
  'whatsapp',
  'chat_provider',
  'embedding_provider'
]);

export const dependencyStatusSchema = z.object({
  name: dependencyNameSchema,
  status: z.enum(['healthy', 'degraded', 'unavailable', 'not_configured']),
  latencyMs: z.number().int().nonnegative().nullable()
});

export const overviewSchema = z.object({
  dependencies: z.array(dependencyStatusSchema),
  sendingPaused: z.boolean(),
  killSwitch: z.boolean(),
  riskLevel: riskLevelSchema,
  metricsAvailable: z.boolean(),
  metrics: z.object({
    inbound: z.number().int().nonnegative(),
    outbound: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    handoffs: z.number().int().nonnegative()
  }),
  lastUpdatedAt: z.iso.datetime(),
  degraded: z.boolean()
});

export const whatsAppStateSchema = z.enum([
  'starting',
  'connecting',
  'qr_required',
  'connected',
  'reconnecting',
  'paused',
  'logged_out',
  'bad_session',
  'disconnected',
  'shutting_down'
]);

export const internalQrResponseSchema = z
  .object({
    qr: z.string().min(1).max(4_096),
    expiresAt: z.iso.datetime()
  })
  .strict();

export const reasonRequestSchema = z.object({ reason: z.string().trim().min(8).max(500) }).strict();
export const revisionedReasonRequestSchema = reasonRequestSchema.extend({
  expectedRevision: z.number().int().nonnegative()
});

export const sessionReconnectRequestSchema = z
  .object({ expectedRevision: z.number().int().nonnegative() })
  .strict();

export const sessionDisconnectRequestSchema = sessionReconnectRequestSchema.extend({
  confirmation: z.literal('PUTUS KONEKSI')
});

export const sessionResetRequestSchema = revisionedReasonRequestSchema.extend({
  confirmation: z.literal('RESET SESI')
});

export const safetyResetRequestSchema = revisionedReasonRequestSchema.extend({
  confirmation: z.literal('RESET KEAMANAN')
});

export const safetyStateSchema = z.object({
  sendingPaused: z.boolean(),
  killSwitch: z.boolean(),
  riskLevel: riskLevelSchema,
  reason: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime()
});
