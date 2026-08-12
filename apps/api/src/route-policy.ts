import type { Permission } from '@raho/contracts';

export type HttpMethod = 'GET' | 'POST';

export interface ProtectedRoutePolicy {
  method: HttpMethod;
  path: string;
  permission: Permission;
}

export const protectedRoutePolicies = [
  { method: 'GET', path: '/api/admin/v1/health/dependencies', permission: 'overview.read' },
  { method: 'GET', path: '/api/admin/v1/overview', permission: 'overview.read' },
  { method: 'GET', path: '/api/admin/v1/events/stream', permission: 'overview.read' },
  { method: 'GET', path: '/api/admin/v1/session', permission: 'session.read' },
  { method: 'GET', path: '/api/admin/v1/session/qr', permission: 'session.manage' },
  { method: 'POST', path: '/api/admin/v1/session/reconnect', permission: 'session.manage' },
  { method: 'POST', path: '/api/admin/v1/session/disconnect', permission: 'session.manage' },
  { method: 'POST', path: '/api/admin/v1/session/reset', permission: 'safety.reset' },
  { method: 'GET', path: '/api/admin/v1/safety/stats', permission: 'safety.read' },
  { method: 'POST', path: '/api/admin/v1/safety/pause', permission: 'safety.manage' },
  { method: 'POST', path: '/api/admin/v1/safety/resume', permission: 'safety.manage' },
  { method: 'POST', path: '/api/admin/v1/safety/reset', permission: 'safety.reset' },
  { method: 'GET', path: '/api/admin/v1/audit', permission: 'audit.read' },
  { method: 'GET', path: '/api/admin/v1/ai/integration', permission: 'ai.settings.manage' },
  {
    method: 'POST',
    path: '/api/admin/v1/ai/integration/activate',
    permission: 'ai.activate'
  },
  {
    method: 'POST',
    path: '/api/admin/v1/ai/integration/deactivate',
    permission: 'ai.activate'
  },
  {
    method: 'GET',
    path: '/api/admin/v1/ai/provider-connections',
    permission: 'ai.settings.manage'
  },
  {
    method: 'POST',
    path: '/api/admin/v1/ai/provider-connections',
    permission: 'ai.settings.manage'
  },
  {
    method: 'POST',
    path: '/api/admin/v1/ai/provider-connections/:id',
    permission: 'ai.settings.manage'
  },
  {
    method: 'POST',
    path: '/api/admin/v1/ai/provider-connections/:id/credential',
    permission: 'ai.settings.manage'
  },
  {
    method: 'POST',
    path: '/api/admin/v1/ai/provider-connections/:id/credential/delete',
    permission: 'ai.settings.manage'
  },
  {
    method: 'POST',
    path: '/api/admin/v1/ai/provider-connections/:id/test',
    permission: 'ai.settings.manage'
  },
  {
    method: 'GET',
    path: '/api/admin/v1/ai/provider-connections/:id/models',
    permission: 'ai.settings.manage'
  },
  { method: 'GET', path: '/api/admin/v1/ai/knowledge/categories', permission: 'knowledge.read' },
  { method: 'POST', path: '/api/admin/v1/ai/knowledge/categories', permission: 'knowledge.manage' },
  { method: 'GET', path: '/api/admin/v1/ai/knowledge', permission: 'knowledge.read' },
  { method: 'POST', path: '/api/admin/v1/ai/knowledge', permission: 'knowledge.manage' },
  { method: 'POST', path: '/api/admin/v1/ai/knowledge/:id', permission: 'knowledge.manage' },
  {
    method: 'POST',
    path: '/api/admin/v1/ai/knowledge/:id/lifecycle',
    permission: 'knowledge.manage'
  },
  { method: 'GET', path: '/api/admin/v1/ai/documents', permission: 'knowledge.read' },
  { method: 'POST', path: '/api/admin/v1/ai/documents', permission: 'knowledge.manage' },
  {
    method: 'GET',
    path: '/api/admin/v1/ai/documents/:id/download',
    permission: 'knowledge.read'
  },
  {
    method: 'POST',
    path: '/api/admin/v1/ai/documents/:id/retry',
    permission: 'knowledge.manage'
  },
  {
    method: 'POST',
    path: '/api/admin/v1/ai/documents/:id/archive',
    permission: 'knowledge.manage'
  },
  { method: 'POST', path: '/api/admin/v1/ai/search/test', permission: 'knowledge.read' },
  { method: 'POST', path: '/api/admin/v1/ai/playground', permission: 'knowledge.read' },
  { method: 'GET', path: '/api/admin/v1/ai/prompts', permission: 'ai.settings.manage' },
  { method: 'POST', path: '/api/admin/v1/ai/prompts', permission: 'ai.settings.manage' },
  { method: 'GET', path: '/api/admin/v1/ai/traces', permission: 'ai.analytics.read' },
  {
    method: 'POST',
    path: '/api/admin/v1/ai/traces/:id/feedback',
    permission: 'knowledge.manage'
  },
  { method: 'GET', path: '/api/admin/v1/ai/unanswered', permission: 'ai.analytics.read' },
  {
    method: 'POST',
    path: '/api/admin/v1/ai/unanswered/:id/draft',
    permission: 'knowledge.manage'
  },
  { method: 'GET', path: '/api/admin/v1/ai/test-cases', permission: 'ai.analytics.read' },
  { method: 'POST', path: '/api/admin/v1/ai/test-cases', permission: 'ai.settings.manage' },
  {
    method: 'POST',
    path: '/api/admin/v1/ai/test-cases/import',
    permission: 'ai.settings.manage'
  },
  { method: 'POST', path: '/api/admin/v1/ai/test-runs', permission: 'ai.settings.manage' },
  { method: 'GET', path: '/api/admin/v1/ai/analytics', permission: 'ai.analytics.read' },
  {
    method: 'GET',
    path: '/api/admin/v1/ai/release-readiness',
    permission: 'ai.analytics.read'
  },
  {
    method: 'POST',
    path: '/api/admin/v1/ai/release-readiness/evaluate',
    permission: 'ai.activate'
  },
  {
    method: 'POST',
    path: '/api/admin/v1/ai/release-readiness/:id/decision',
    permission: 'ai.activate'
  },
  { method: 'GET', path: '/api/admin/v1/ai/alerts', permission: 'safety.read' },
  {
    method: 'POST',
    path: '/api/admin/v1/ai/alerts/:id/acknowledge',
    permission: 'safety.manage'
  },
  { method: 'GET', path: '/api/admin/v1/templates', permission: 'templates.read' },
  { method: 'POST', path: '/api/admin/v1/templates', permission: 'templates.manage' },
  { method: 'POST', path: '/api/admin/v1/templates/preview', permission: 'templates.read' },
  { method: 'GET', path: '/api/admin/v1/templates/:id', permission: 'templates.read' },
  {
    method: 'POST',
    path: '/api/admin/v1/templates/:id/versions',
    permission: 'templates.manage'
  },
  {
    method: 'POST',
    path: '/api/admin/v1/templates/:id/publish',
    permission: 'templates.manage'
  },
  {
    method: 'POST',
    path: '/api/admin/v1/templates/:id/duplicate',
    permission: 'templates.manage'
  },
  {
    method: 'POST',
    path: '/api/admin/v1/templates/:id/lifecycle',
    permission: 'templates.manage'
  },
  { method: 'GET', path: '/api/admin/v1/contacts', permission: 'contacts.read' },
  { method: 'POST', path: '/api/admin/v1/contacts', permission: 'messages.send' },
  { method: 'GET', path: '/api/admin/v1/contacts/:id', permission: 'contacts.read' },
  { method: 'GET', path: '/api/admin/v1/conversations', permission: 'messages.read' },
  { method: 'GET', path: '/api/admin/v1/conversations/:id/messages', permission: 'messages.read' },
  { method: 'POST', path: '/api/admin/v1/messages', permission: 'messages.send' },
  { method: 'GET', path: '/api/admin/v1/messages/:id', permission: 'messages.read' },
  { method: 'GET', path: '/api/admin/v1/outbox', permission: 'messages.read' },
  { method: 'POST', path: '/api/admin/v1/outbox/:id/cancel', permission: 'messages.retry' },
  { method: 'POST', path: '/api/admin/v1/outbox/:id/retry', permission: 'messages.retry' },
  { method: 'POST', path: '/api/admin/v1/outbox/:id/reconcile', permission: 'messages.retry' },
  { method: 'GET', path: '/api/admin/v1/handoffs', permission: 'handoffs.read' },
  { method: 'POST', path: '/api/admin/v1/handoffs', permission: 'handoffs.manage' },
  { method: 'POST', path: '/api/admin/v1/handoffs/:id/assign', permission: 'handoffs.manage' },
  { method: 'POST', path: '/api/admin/v1/handoffs/:id/resolve', permission: 'handoffs.manage' },
  { method: 'GET', path: '/api/admin/v1/chatbot/config', permission: 'chatbot.read' },
  { method: 'POST', path: '/api/admin/v1/chatbot/config', permission: 'chatbot.manage' },
  {
    method: 'POST',
    path: '/api/admin/v1/chatbot/config/:id/publish',
    permission: 'chatbot.manage'
  },
  { method: 'POST', path: '/api/admin/v1/chatbot/test', permission: 'chatbot.read' }
] as const satisfies readonly ProtectedRoutePolicy[];

export const permissionForRoute = (method: HttpMethod, path: string): Permission => {
  const policy = protectedRoutePolicies.find(
    (candidate) => candidate.method === method && candidate.path === path
  );
  if (!policy) throw new Error(`Missing permission policy for ${method} ${path}`);
  return policy.permission;
};
