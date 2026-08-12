import { z } from 'zod';

export const tenantStatusSchema = z.enum(['active', 'suspended', 'disabled']);
export const adminUserStatusSchema = z.enum(['active', 'locked', 'disabled']);
export const riskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);
export const auditActionSchema = z.enum([
  'auth.login.failed',
  'auth.login.succeeded',
  'auth.session.revoked',
  'auth.password.changed',
  'whatsapp.session.reconnect_requested',
  'whatsapp.session.disconnected',
  'whatsapp.session.reset',
  'safety.state.reset'
]);

export type RiskLevel = z.infer<typeof riskLevelSchema>;
export type AuditAction = z.infer<typeof auditActionSchema>;
