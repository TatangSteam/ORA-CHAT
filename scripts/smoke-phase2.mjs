/* global fetch, setTimeout */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const webBase = process.env.PHASE2_BASE_URL ?? 'http://127.0.0.1:3000';
const apiBase = process.env.PHASE2_API_URL ?? 'http://127.0.0.1:4000';
const password = readFileSync(
  process.env.BOOTSTRAP_ADMIN_PASSWORD_FILE ?? '.secrets/bootstrap_admin_password',
  'utf8'
).trim();
const internalToken = readFileSync('.secrets/whatsapp_internal_token', 'utf8').trim();

const compose = (args, allowFailure = false) => {
  const result = spawnSync('docker', ['compose', '--env-file', '.env.example', ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  if (!allowFailure && (result.error || result.status !== 0)) {
    throw result.error ?? new Error(result.stderr || result.stdout || 'Compose command failed');
  }
  return result;
};

const sql = (statement) =>
  compose([
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'raho_app',
    '-d',
    'raho_chatbot',
    '-At',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    statement
  ]).stdout.trim();

const cookieFrom = (response, name) => {
  const header = response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
  const value = header?.match(new RegExp(`^${name}=([^;]*)`, 'u'))?.[1];
  if (!value) throw new Error(`${name} cookie missing`);
  return `${name}=${value}`;
};

const json = async (base, path, init = {}) => {
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${path} returned non-JSON status ${response.status}`);
  }
  return { response, body };
};

const waitFor = async (read, predicate, label, timeoutMs = 25_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const csrfStart = await json(webBase, '/api/admin/v1/auth/csrf');
const loginCookie = cookieFrom(csrfStart.response, 'raho_login_csrf');
const login = await json(webBase, '/api/admin/v1/auth/login', {
  method: 'POST',
  headers: {
    cookie: loginCookie,
    'content-type': 'application/json',
    'x-csrf-token': csrfStart.body.data.csrfToken
  },
  body: JSON.stringify({ tenantSlug: 'default', username: 'superadmin', password })
});
if (login.response.status !== 201) throw new Error('Phase 2 login failed');
const sessionName = login.response.headers
  .getSetCookie()
  .some((value) => value.startsWith('__Host-raho_session='))
  ? '__Host-raho_session'
  : 'raho_session';
const cookie = cookieFrom(login.response, sessionName);
const me = await json(webBase, '/api/admin/v1/me', { headers: { cookie } });
if (me.response.status !== 200) throw new Error('Phase 2 session failed');
const csrf = me.body.data.csrfToken;
const tenantId = me.body.data.tenant.id;
const userId = me.body.data.id;

const admin = (path, init = {}) =>
  json(webBase, `/api/admin/v1${path}`, {
    ...init,
    headers: {
      cookie,
      ...(init.body ? { 'content-type': 'application/json', 'x-csrf-token': csrf } : {}),
      ...init.headers
    }
  });

const originalWhatsAppState = sql(
  `SELECT state FROM whatsapp_session_states WHERE tenant_id = '${tenantId}'::uuid`
);
const suffix = Date.now().toString().slice(-8);
let workerStopped = false;
let whatsappStopped = false;

try {
  compose(['stop', 'worker']);
  workerStopped = true;
  compose(['stop', 'whatsapp']);
  whatsappStopped = true;
  sql(
    `UPDATE whatsapp_session_states SET state = 'connected', revision = revision + 1, updated_at = NOW() WHERE tenant_id = '${tenantId}'::uuid`
  );

  const currentConfig = await admin('/chatbot/config');
  if (currentConfig.response.status !== 200) throw new Error('Rule config read failed');
  const expectedRevision =
    currentConfig.body.data?.status === 'draft' ? currentConfig.body.data.revision : 0;
  const trigger = `menu-${suffix}`;
  const saved = await admin('/chatbot/config', {
    method: 'POST',
    body: JSON.stringify({
      expectedRevision,
      fallback: 'Mohon tunggu, admin kami akan membantu Anda.',
      rules: [
        {
          sequence: 10,
          name: 'Menu smoke Fase 2',
          triggerType: 'exact',
          trigger,
          response: 'Respons deterministic Fase 2',
          enabled: true
        }
      ]
    })
  });
  if (saved.response.status !== 200) throw new Error('Rule draft save failed');

  const playgroundCountsBefore = sql(
    "SELECT (SELECT count(*) FROM contacts) || '|' || (SELECT count(*) FROM messages)"
  );
  const tested = await admin('/chatbot/test', {
    method: 'POST',
    body: JSON.stringify({ input: trigger, versionId: saved.body.data.id })
  });
  if (
    tested.response.status !== 200 ||
    tested.body.data.response !== 'Respons deterministic Fase 2'
  ) {
    throw new Error('Deterministic rule test failed');
  }
  const playgroundCountsAfter = sql(
    "SELECT (SELECT count(*) FROM contacts) || '|' || (SELECT count(*) FROM messages)"
  );
  if (playgroundCountsBefore !== playgroundCountsAfter) {
    throw new Error('Chatbot playground created a WhatsApp recipient or message');
  }
  const published = await admin(`/chatbot/config/${saved.body.data.id}/publish`, {
    method: 'POST',
    body: JSON.stringify({
      expectedRevision: saved.body.data.revision,
      reason: 'Acceptance publish rule Fase 2'
    })
  });
  if (published.response.status !== 200 || published.body.data.status !== 'published') {
    throw new Error('Atomic rule publish failed');
  }

  const phone = `0812${suffix}`;
  const messageBody = { phone, displayName: 'Kontak Fase 2', content: 'Pesan manual Fase 2' };
  const idempotencyKey = `phase2-manual-${suffix}`;
  const firstMessage = await admin('/messages', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(messageBody)
  });
  if (firstMessage.response.status !== 202) throw new Error('Manual outbound create failed');
  const duplicateMessage = await admin('/messages', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(messageBody)
  });
  if (
    duplicateMessage.response.status !== 202 ||
    duplicateMessage.body.data.messageId !== firstMessage.body.data.messageId ||
    duplicateMessage.body.data.outboxMessageId !== firstMessage.body.data.outboxMessageId
  ) {
    throw new Error('Duplicate HTTP request created a different resource');
  }
  const conflict = await admin('/messages', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify({ ...messageBody, content: 'Payload berbeda' })
  });
  if (conflict.response.status !== 409)
    throw new Error('Idempotency hash conflict was not rejected');
  const duplicateCount = Number(
    sql(
      `SELECT count(*) FROM messages WHERE id = '${firstMessage.body.data.messageId}'::uuid AND tenant_id = '${tenantId}'::uuid`
    )
  );
  if (duplicateCount !== 1) throw new Error('Duplicate message row detected');

  const secondMessage = await admin('/messages', {
    method: 'POST',
    headers: { 'idempotency-key': `phase2-lease-${suffix}` },
    body: JSON.stringify({ ...messageBody, content: 'Fixture crash sebelum send' })
  });
  if (secondMessage.response.status !== 202) throw new Error('Lease fixture create failed');

  const aiSmoke = compose([
    'exec',
    '-T',
    'api',
    '/nodejs/bin/node',
    'apps/api/dist/messaging-smoke.js'
  ]);
  const aiResult = JSON.parse(aiSmoke.stdout.trim().split('\n').at(-1));
  if (aiResult.status !== 'passed' || aiResult.source !== 'ai')
    throw new Error('AI outbox path failed');
  const delivered = compose([
    'run',
    '--rm',
    '--no-deps',
    'worker',
    'apps/worker/dist/delivery-smoke.js'
  ]);
  const deliveryResult = JSON.parse(delivered.stdout.trim().split('\n').at(-1));
  if (deliveryResult.status !== 'passed') throw new Error('Accepted provider delivery path failed');

  const senderPhone = `62813${suffix}`;
  const inboundPayload = {
    tenantId,
    providerEventId: `phase2-event-${suffix}`,
    providerMessageId: `phase2-provider-${suffix}`,
    senderJid: `${senderPhone}@s.whatsapp.net`,
    displayName: 'Inbound Fase 2',
    content: trigger,
    occurredAt: new Date().toISOString()
  };
  const inbound = await json(apiBase, '/internal/v1/whatsapp/inbound', {
    method: 'POST',
    headers: { authorization: `Bearer ${internalToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(inboundPayload)
  });
  if (inbound.response.status !== 202 || inbound.body.data.duplicate) {
    throw new Error('Inbound provider event ingestion failed');
  }
  const inboundDuplicate = await json(apiBase, '/internal/v1/whatsapp/inbound', {
    method: 'POST',
    headers: { authorization: `Bearer ${internalToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(inboundPayload)
  });
  if (inboundDuplicate.response.status !== 200 || !inboundDuplicate.body.data.duplicate) {
    throw new Error('Duplicate provider event was not deduplicated');
  }
  const inboundCount = Number(
    sql(`SELECT count(*) FROM messages WHERE provider_message_id = 'phase2-provider-${suffix}'`)
  );
  if (inboundCount !== 1) throw new Error('Duplicate inbound message row detected');
  const forbiddenEventMutation = compose(
    [
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'raho_app',
      '-d',
      'raho_chatbot',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `UPDATE message_events SET event_type = event_type WHERE message_id = '${inbound.body.data.messageId}'::uuid`
    ],
    true
  );
  if (
    forbiddenEventMutation.status === 0 ||
    !forbiddenEventMutation.stderr.includes('message_events is append-only')
  ) {
    throw new Error('Message event append-only guard was not enforced');
  }

  const handoffBody = {
    conversationId: inbound.body.data.conversationId,
    triggerMessageId: inbound.body.data.messageId,
    reasonCode: `smoke_${suffix}`,
    priority: 'high'
  };
  const handoff = await admin('/handoffs', { method: 'POST', body: JSON.stringify(handoffBody) });
  const handoffDuplicate = await admin('/handoffs', {
    method: 'POST',
    body: JSON.stringify(handoffBody)
  });
  if (
    handoff.response.status !== 201 ||
    handoffDuplicate.response.status !== 200 ||
    handoff.body.data.id !== handoffDuplicate.body.data.id
  ) {
    throw new Error('Handoff active-reason idempotency failed');
  }
  const assigned = await admin(`/handoffs/${handoff.body.data.id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ assigneeUserId: userId, reason: 'Acceptance assignment Fase 2' })
  });
  if (assigned.response.status !== 200 || assigned.body.data.status !== 'assigned') {
    throw new Error('Handoff assignment failed');
  }
  const resolved = await admin(`/handoffs/${handoff.body.data.id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ resolutionNote: 'Acceptance handoff telah ditangani' })
  });
  if (resolved.response.status !== 200 || resolved.body.data.status !== 'resolved') {
    throw new Error('Handoff resolution failed');
  }

  const foreignTenantId = randomUUID();
  const foreignContactId = randomUUID();
  sql(
    `INSERT INTO tenants (id, slug, name, status, updated_at) VALUES ('${foreignTenantId}'::uuid, 'phase2-${suffix}', 'Foreign fixture', 'active', NOW()); INSERT INTO contacts (id, tenant_id, normalized_phone, provider_jid, updated_at) VALUES ('${foreignContactId}'::uuid, '${foreignTenantId}'::uuid, '628999${suffix}', '628999${suffix}@s.whatsapp.net', NOW())`
  );
  try {
    const idor = await admin(`/contacts/${foreignContactId}`);
    if (idor.response.status !== 404) throw new Error('Cross-tenant contact IDOR was not denied');
  } finally {
    sql(
      `DELETE FROM contacts WHERE id = '${foreignContactId}'::uuid; DELETE FROM tenants WHERE id = '${foreignTenantId}'::uuid`
    );
  }

  sql(
    `UPDATE whatsapp_session_states SET state = 'connecting', revision = revision + 1, updated_at = NOW() WHERE tenant_id = '${tenantId}'::uuid; UPDATE outbox_messages SET status = 'leased', lease_expires_at = NOW() - INTERVAL '1 minute', leased_by = 'crashed-before-send' WHERE id = '${secondMessage.body.data.outboxMessageId}'::uuid; UPDATE messages SET status = 'leased' WHERE id = '${secondMessage.body.data.messageId}'::uuid; UPDATE outbox_messages SET status = 'sending', lease_expires_at = NOW() - INTERVAL '1 minute', leased_by = 'crashed-after-send' WHERE id = '${inbound.body.data.ruleOutboxMessageId}'::uuid; UPDATE messages SET status = 'sending' WHERE id = (SELECT message_id FROM outbox_messages WHERE id = '${inbound.body.data.ruleOutboxMessageId}'::uuid)`
  );
  compose(['restart', 'redis']);
  compose(['start', 'worker']);
  workerStopped = false;

  await waitFor(
    () =>
      Promise.resolve(
        sql(
          `SELECT status FROM outbox_messages WHERE id = '${firstMessage.body.data.outboxMessageId}'::uuid`
        )
      ),
    (status) => status === 'retryable' || status === 'failed',
    'pre-accept retry state'
  );
  const leaseEvent = Number(
    await waitFor(
      () =>
        Promise.resolve(
          sql(
            `SELECT count(*) FROM message_events WHERE message_id = '${secondMessage.body.data.messageId}'::uuid AND event_type = 'outbox.lease.expired'`
          )
        ),
      (count) => Number(count) > 0,
      'expired lease recovery'
    )
  );
  const unknownStatus = await waitFor(
    () =>
      Promise.resolve(
        sql(
          `SELECT status FROM outbox_messages WHERE id = '${inbound.body.data.ruleOutboxMessageId}'::uuid`
        )
      ),
    (status) => status === 'unknown',
    'post-send unknown state'
  );
  if (leaseEvent < 1 || unknownStatus !== 'unknown')
    throw new Error('Crash recovery semantics failed');

  const overview = await admin('/overview');
  if (overview.response.status !== 200 || overview.body.data.metricsAvailable !== true) {
    throw new Error('Phase 2 metrics availability failed');
  }
  const sources = sql(
    `SELECT string_agg(DISTINCT source, ',' ORDER BY source) FROM messages WHERE tenant_id = '${tenantId}'::uuid AND source IN ('manual','rule','ai') AND id IN ('${firstMessage.body.data.messageId}'::uuid, (SELECT message_id FROM outbox_messages WHERE id = '${inbound.body.data.ruleOutboxMessageId}'::uuid), '${aiResult.messageId}'::uuid)`
  );
  if (sources !== 'ai,manual,rule')
    throw new Error('Manual/rule/AI did not share Message/Outbox path');

  process.stdout.write(
    `${JSON.stringify({
      acceptedProviderPath: true,
      activeHandoffIdempotency: true,
      crashAfterSend: 'unknown',
      crashBeforeSend: 'retryable',
      duplicateHttp: true,
      duplicateInbound: true,
      immutableTimeline: true,
      idorDenied: true,
      metricsAvailable: true,
      playgroundIsolated: true,
      redisRestartReconciled: true,
      sharedOutboxSources: sources,
      status: 'passed'
    })}\n`
  );
} finally {
  sql(
    `UPDATE whatsapp_session_states SET state = '${originalWhatsAppState}', revision = revision + 1, updated_at = NOW() WHERE tenant_id = '${tenantId}'::uuid`
  );
  if (workerStopped) compose(['start', 'worker'], true);
  if (whatsappStopped) compose(['start', 'whatsapp'], true);
}
