import { describe, expect, it } from 'vitest';
import { resolvePermissions, rolePermissions, roleSchema } from '@raho/contracts';

import { permissionForRoute, protectedRoutePolicies } from './route-policy.js';

const expectedRoutes = [
  'GET /api/admin/v1/health/dependencies',
  'GET /api/admin/v1/overview',
  'GET /api/admin/v1/events/stream',
  'GET /api/admin/v1/session',
  'GET /api/admin/v1/session/qr',
  'POST /api/admin/v1/session/reconnect',
  'POST /api/admin/v1/session/disconnect',
  'POST /api/admin/v1/session/reset',
  'GET /api/admin/v1/safety/stats',
  'POST /api/admin/v1/safety/pause',
  'POST /api/admin/v1/safety/resume',
  'POST /api/admin/v1/safety/reset',
  'GET /api/admin/v1/audit',
  'GET /api/admin/v1/ai/integration',
  'POST /api/admin/v1/ai/integration/activate',
  'POST /api/admin/v1/ai/integration/deactivate',
  'GET /api/admin/v1/ai/provider-connections',
  'POST /api/admin/v1/ai/provider-connections',
  'POST /api/admin/v1/ai/provider-connections/:id',
  'POST /api/admin/v1/ai/provider-connections/:id/credential',
  'POST /api/admin/v1/ai/provider-connections/:id/credential/delete',
  'POST /api/admin/v1/ai/provider-connections/:id/test',
  'GET /api/admin/v1/ai/provider-connections/:id/models',
  'GET /api/admin/v1/ai/knowledge/categories',
  'POST /api/admin/v1/ai/knowledge/categories',
  'GET /api/admin/v1/ai/knowledge',
  'POST /api/admin/v1/ai/knowledge',
  'POST /api/admin/v1/ai/knowledge/:id',
  'POST /api/admin/v1/ai/knowledge/:id/lifecycle',
  'GET /api/admin/v1/ai/documents',
  'POST /api/admin/v1/ai/documents',
  'GET /api/admin/v1/ai/documents/:id/download',
  'POST /api/admin/v1/ai/documents/:id/retry',
  'POST /api/admin/v1/ai/documents/:id/archive',
  'POST /api/admin/v1/ai/search/test',
  'POST /api/admin/v1/ai/playground',
  'GET /api/admin/v1/ai/prompts',
  'POST /api/admin/v1/ai/prompts',
  'GET /api/admin/v1/ai/traces',
  'POST /api/admin/v1/ai/traces/:id/feedback',
  'GET /api/admin/v1/ai/unanswered',
  'POST /api/admin/v1/ai/unanswered/:id/draft',
  'GET /api/admin/v1/ai/test-cases',
  'POST /api/admin/v1/ai/test-cases',
  'POST /api/admin/v1/ai/test-cases/import',
  'POST /api/admin/v1/ai/test-runs',
  'GET /api/admin/v1/ai/analytics',
  'GET /api/admin/v1/ai/release-readiness',
  'POST /api/admin/v1/ai/release-readiness/evaluate',
  'POST /api/admin/v1/ai/release-readiness/:id/decision',
  'GET /api/admin/v1/ai/alerts',
  'POST /api/admin/v1/ai/alerts/:id/acknowledge',
  'GET /api/admin/v1/templates',
  'POST /api/admin/v1/templates',
  'POST /api/admin/v1/templates/preview',
  'GET /api/admin/v1/templates/:id',
  'POST /api/admin/v1/templates/:id/versions',
  'POST /api/admin/v1/templates/:id/publish',
  'POST /api/admin/v1/templates/:id/duplicate',
  'POST /api/admin/v1/templates/:id/lifecycle',
  'GET /api/admin/v1/contacts',
  'POST /api/admin/v1/contacts',
  'GET /api/admin/v1/contacts/:id',
  'GET /api/admin/v1/conversations',
  'GET /api/admin/v1/conversations/:id/messages',
  'POST /api/admin/v1/messages',
  'GET /api/admin/v1/messages/:id',
  'GET /api/admin/v1/outbox',
  'POST /api/admin/v1/outbox/:id/cancel',
  'POST /api/admin/v1/outbox/:id/retry',
  'POST /api/admin/v1/outbox/:id/reconcile',
  'GET /api/admin/v1/handoffs',
  'POST /api/admin/v1/handoffs',
  'POST /api/admin/v1/handoffs/:id/assign',
  'POST /api/admin/v1/handoffs/:id/resolve',
  'GET /api/admin/v1/chatbot/config',
  'POST /api/admin/v1/chatbot/config',
  'POST /api/admin/v1/chatbot/config/:id/publish',
  'POST /api/admin/v1/chatbot/test'
];

describe('exhaustive Fase 1 through Fase 6 endpoint permission matrix', () => {
  it('maps every permission-protected route exactly once', () => {
    const actual = protectedRoutePolicies.map(({ method, path }) => `${method} ${path}`);
    expect(actual).toEqual(expectedRoutes);
    expect(new Set(actual).size).toBe(actual.length);
    for (const policy of protectedRoutePolicies) {
      expect(permissionForRoute(policy.method, policy.path)).toBe(policy.permission);
    }
  });

  it('evaluates every route against every role with deny taking precedence', () => {
    for (const role of roleSchema.options) {
      const permissions = resolvePermissions(role, { grant: [], deny: [] });
      for (const { permission } of protectedRoutePolicies) {
        expect(permissions.has(permission)).toBe(rolePermissions[role].includes(permission));
      }
    }
    for (const { permission } of protectedRoutePolicies) {
      expect(
        resolvePermissions('super_admin', { grant: [], deny: [permission] }).has(permission)
      ).toBe(false);
    }
  });
});
