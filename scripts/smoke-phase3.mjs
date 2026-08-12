/* global fetch */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const baseUrl = process.env.PHASE3_BASE_URL ?? 'http://127.0.0.1:3000';
const password = readFileSync(
  process.env.BOOTSTRAP_ADMIN_PASSWORD_FILE ?? '.secrets/bootstrap_admin_password',
  'utf8'
).trim();

const compose = (args) => {
  const result = spawnSync('docker', ['compose', '--env-file', '.env.example', ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(result.stderr || result.stdout || 'Compose command failed');
  }
  return result.stdout.trim();
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
  ]);

const cookieFrom = (response, name) => {
  const header = response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
  const value = header?.match(new RegExp(`^${name}=([^;]*)`, 'u'))?.[1];
  if (!value) throw new Error(`${name} cookie missing`);
  return `${name}=${value}`;
};

const requestJson = async (path, init = {}) => {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${path} returned non-JSON status ${response.status}`);
  }
  return { response, body, text };
};

const preLogin = await requestJson('/api/admin/v1/auth/csrf');
const loginCookie = cookieFrom(preLogin.response, 'raho_login_csrf');
const login = await requestJson('/api/admin/v1/auth/login', {
  method: 'POST',
  headers: {
    cookie: loginCookie,
    'content-type': 'application/json',
    'x-csrf-token': preLogin.body.data.csrfToken
  },
  body: JSON.stringify({ tenantSlug: 'default', username: 'superadmin', password })
});
if (login.response.status !== 201) throw new Error('Phase 3 login failed');
const sessionName = login.response.headers
  .getSetCookie()
  .some((value) => value.startsWith('__Host-raho_session='))
  ? '__Host-raho_session'
  : 'raho_session';
const cookie = cookieFrom(login.response, sessionName);
const me = await requestJson('/api/admin/v1/me', { headers: { cookie } });
if (me.response.status !== 200) throw new Error('Phase 3 session failed');
const tenantId = me.body.data.tenant.id;
const csrf = me.body.data.csrfToken;

const admin = (path, init = {}) =>
  requestJson(`/api/admin/v1${path}`, {
    ...init,
    headers: {
      cookie,
      ...(init.body ? { 'content-type': 'application/json', 'x-csrf-token': csrf } : {}),
      ...init.headers
    }
  });

const originalIntegrationText = sql(
  `SELECT row_to_json(snapshot)::text FROM (SELECT id, active_chat_connection_id, active_embedding_connection_id, active_embedding_index_version_id, generation_enabled, retrieval_enabled, status, revision FROM ai_integrations WHERE tenant_id = '${tenantId}'::uuid AND name = 'default') snapshot`
);
const originalIntegration = originalIntegrationText ? JSON.parse(originalIntegrationText) : null;
const suffix = Date.now().toString();
const prefix = `phase3-${suffix}`;
const createdConnectionIds = [];
const createdCredentialIds = [];
let reindexRequired;

const createConnection = async (configuration) => {
  const result = await admin('/ai/provider-connections', {
    method: 'POST',
    body: JSON.stringify({
      timeoutMs: 5_000,
      maxRetries: 0,
      maxOutputTokens: 256,
      generationConfig: {},
      reason: 'Acceptance otomatis konfigurasi Fase 3',
      ...configuration
    })
  });
  if (result.response.status !== 201) {
    throw new Error(`Provider connection create failed: ${result.text}`);
  }
  createdConnectionIds.push(result.body.data.id);
  if (result.body.data.credentialConfigured) {
    const credentialId = sql(
      `SELECT credential_id::text FROM ai_provider_connections WHERE id = '${result.body.data.id}'::uuid`
    );
    if (credentialId) createdCredentialIds.push(credentialId);
  }
  return result.body.data;
};

const testConnection = async (connection) => {
  const result = await admin(`/ai/provider-connections/${connection.id}/test`, {
    method: 'POST',
    body: JSON.stringify({
      expectedRevision: connection.revision,
      reason: 'Acceptance otomatis uji provider Fase 3'
    })
  });
  if (result.response.status !== 200) throw new Error(`Provider test failed: ${result.text}`);
  return result.body.data;
};

try {
  const integrationResult = await admin('/ai/integration');
  if (integrationResult.response.status !== 200) throw new Error('AI integration read failed');
  let integration = integrationResult.body.data;

  let chat = await createConnection({
    name: `${prefix}-chat`,
    purpose: 'chat',
    provider: 'mock',
    transport: 'native',
    baseUrl: null,
    modelId: 'mock-safe',
    dimensions: null,
    taskType: null
  });
  const chatTest = await testConnection(chat);
  if (
    chatTest.test.healthState !== 'ready' ||
    chatTest.connection.testedRevision !== chat.revision
  ) {
    throw new Error('Mock chat did not reach tested ready state');
  }
  chat = chatTest.connection;
  const activatedChat = await admin('/ai/integration/activate', {
    method: 'POST',
    body: JSON.stringify({
      purpose: 'chat',
      connectionId: chat.id,
      expectedRevision: integration.revision,
      reason: 'Acceptance aktivasi chat Fase 3'
    })
  });
  if (activatedChat.response.status !== 200 || !activatedChat.body.data.generationEnabled) {
    throw new Error('Independent chat activation failed');
  }
  integration = activatedChat.body.data;
  const staleActivation = await admin('/ai/integration/activate', {
    method: 'POST',
    body: JSON.stringify({
      purpose: 'chat',
      connectionId: chat.id,
      expectedRevision: integration.revision - 1,
      reason: 'Acceptance stale revision Fase 3'
    })
  });
  if (staleActivation.response.status !== 409) throw new Error('Stale activation was accepted');

  let embedding = await createConnection({
    name: `${prefix}-embedding`,
    purpose: 'embedding',
    provider: 'mock',
    transport: 'native',
    baseUrl: null,
    modelId: 'mock-embedding-v1',
    dimensions: 8,
    taskType: 'RETRIEVAL_QUERY'
  });
  embedding = (await testConnection(embedding)).connection;
  const activatedEmbedding = await admin('/ai/integration/activate', {
    method: 'POST',
    body: JSON.stringify({
      purpose: 'embedding',
      connectionId: embedding.id,
      expectedRevision: integration.revision,
      reason: 'Acceptance aktivasi embedding Fase 3'
    })
  });
  if (
    activatedEmbedding.response.status !== 200 ||
    activatedEmbedding.body.data.activeEmbeddingConnectionId !== embedding.id
  ) {
    throw new Error('Independent embedding activation failed');
  }
  integration = activatedEmbedding.body.data;

  const indexId = randomUUID();
  sql(
    `INSERT INTO embedding_index_versions (id, tenant_id, provider_connection_id, version, model_id, dimensions, state, activated_at, updated_at) SELECT '${indexId}'::uuid, '${tenantId}'::uuid, '${embedding.id}'::uuid, COALESCE(MAX(version), 0) + 1, 'mock-embedding-v1', 8, 'active', NOW(), NOW() FROM embedding_index_versions WHERE tenant_id = '${tenantId}'::uuid; UPDATE ai_integrations SET active_embedding_index_version_id = '${indexId}'::uuid WHERE id = '${integration.id}'::uuid`
  );
  let replacementEmbedding = await createConnection({
    name: `${prefix}-embedding-v2`,
    purpose: 'embedding',
    provider: 'mock',
    transport: 'native',
    baseUrl: null,
    modelId: 'mock-embedding-v2',
    dimensions: 16,
    taskType: 'RETRIEVAL_QUERY'
  });
  replacementEmbedding = (await testConnection(replacementEmbedding)).connection;
  const replacementActivation = await admin('/ai/integration/activate', {
    method: 'POST',
    body: JSON.stringify({
      purpose: 'embedding',
      connectionId: replacementEmbedding.id,
      expectedRevision: integration.revision,
      reason: 'Acceptance guard reindex Fase 3'
    })
  });
  reindexRequired =
    replacementActivation.response.status === 409 &&
    replacementActivation.body.error?.code === 'REINDEX_REQUIRED';
  if (!reindexRequired) throw new Error('Embedding model/dimension change bypassed reindex guard');

  const unsupported = await admin('/ai/provider-connections', {
    method: 'POST',
    body: JSON.stringify({
      name: `${prefix}-invalid-anthropic`,
      purpose: 'embedding',
      provider: 'anthropic',
      transport: 'native',
      baseUrl: null,
      modelId: 'unsupported',
      dimensions: 8,
      taskType: 'RETRIEVAL_QUERY',
      timeoutMs: 5_000,
      maxRetries: 0,
      maxOutputTokens: 256,
      generationConfig: {},
      reason: 'Acceptance unsupported provider Fase 3'
    })
  });
  if (unsupported.response.status !== 400) throw new Error('Anthropic embedding was accepted');

  const secret = `phase3-secret-${suffix}`;
  let blocked = await createConnection({
    name: `${prefix}-blocked`,
    purpose: 'chat',
    provider: 'openai-compatible',
    transport: 'compatible',
    baseUrl: 'http://169.254.169.254/v1',
    modelId: 'blocked-model',
    dimensions: null,
    taskType: null,
    credential: secret
  });
  if (JSON.stringify(blocked).includes(secret) || !blocked.credentialConfigured) {
    throw new Error('Credential was exposed or not stored');
  }
  const blockedTest = await testConnection(blocked);
  if (
    blockedTest.test.healthState !== 'blocked_url' ||
    blockedTest.connection.testedRevision !== null
  ) {
    throw new Error('SSRF metadata URL did not fail closed');
  }
  blocked = blockedTest.connection;
  const preserved = await admin(`/ai/provider-connections/${blocked.id}`, {
    method: 'POST',
    body: JSON.stringify({
      name: blocked.name,
      purpose: blocked.purpose,
      provider: blocked.provider,
      transport: blocked.transport,
      baseUrl: blocked.baseUrl,
      modelId: blocked.modelId,
      dimensions: blocked.dimensions,
      taskType: blocked.taskType,
      timeoutMs: blocked.timeoutMs,
      maxRetries: blocked.maxRetries,
      maxOutputTokens: blocked.maxOutputTokens,
      generationConfig: blocked.generationConfig,
      expectedRevision: blocked.revision,
      reason: 'Acceptance blank secret preservation Fase 3'
    })
  });
  if (preserved.response.status !== 200 || !preserved.body.data.credentialConfigured) {
    throw new Error('Blank secret semantics deleted stored credential');
  }
  blocked = preserved.body.data;
  const deleted = await admin(`/ai/provider-connections/${blocked.id}/credential/delete`, {
    method: 'POST',
    body: JSON.stringify({
      expectedRevision: blocked.revision,
      reason: 'Acceptance pencabutan credential Fase 3'
    })
  });
  if (deleted.response.status !== 200 || deleted.body.data.credentialConfigured) {
    throw new Error('Credential revoke/delete failed');
  }

  const foreignTenantId = randomUUID();
  const foreignConnectionId = randomUUID();
  sql(
    `INSERT INTO tenants (id, slug, name, status, updated_at) VALUES ('${foreignTenantId}'::uuid, '${prefix}', 'Foreign AI fixture', 'active', NOW()); INSERT INTO ai_provider_connections (id, tenant_id, name, purpose, provider, transport, model_id, dimensions, updated_at) VALUES ('${foreignConnectionId}'::uuid, '${foreignTenantId}'::uuid, 'Foreign connection', 'embedding', 'mock', 'native', 'mock-foreign', 8, NOW())`
  );
  try {
    const idor = await admin(`/ai/provider-connections/${foreignConnectionId}/models`);
    if (idor.response.status !== 404)
      throw new Error('Cross-tenant AI connection IDOR was not denied');
  } finally {
    sql(
      `DELETE FROM ai_provider_connections WHERE id = '${foreignConnectionId}'::uuid; DELETE FROM tenants WHERE id = '${foreignTenantId}'::uuid`
    );
  }

  const plaintextMatches = Number(
    sql(
      `SELECT count(*) FROM ai_provider_credentials WHERE tenant_id = '${tenantId}'::uuid AND encode(encrypted_ciphertext, 'escape') LIKE '%${secret}%'`
    )
  );
  if (plaintextMatches !== 0) throw new Error('Credential plaintext found in database');
  const auditCount = Number(
    sql(
      `SELECT count(*) FROM audit_logs WHERE tenant_id = '${tenantId}'::uuid AND action LIKE 'ai.%' AND entity_id = ANY(ARRAY[${createdConnectionIds.map((id) => `'${id}'`).join(',')}])`
    )
  );
  if (auditCount < 6) throw new Error('AI mutation audit evidence is incomplete');

  process.stdout.write(
    `${JSON.stringify({
      auditRecords: auditCount,
      chatProvider: chat.provider,
      credentialEnvelope: 'passed',
      embeddingProvider: embedding.provider,
      idor: 'passed',
      mixedVendors: 'passed',
      reindexRequired,
      ssrfMetadata: blockedTest.test.healthState,
      staleRevision: 409,
      status: 'passed'
    })}\n`
  );
} finally {
  if (createdConnectionIds.length > 0) {
    const ids = createdConnectionIds.map((id) => `'${id}'::uuid`).join(',');
    sql(
      `UPDATE ai_integrations SET active_chat_connection_id = NULL, active_embedding_connection_id = NULL, active_embedding_index_version_id = NULL, generation_enabled = false, retrieval_enabled = false WHERE tenant_id = '${tenantId}'::uuid; DELETE FROM ai_model_capability_cache WHERE connection_id IN (${ids}); DELETE FROM embedding_index_versions WHERE provider_connection_id IN (${ids}); DELETE FROM ai_provider_connections WHERE id IN (${ids});${createdCredentialIds.length > 0 ? ` DELETE FROM ai_provider_credentials WHERE id IN (${createdCredentialIds.map((id) => `'${id}'::uuid`).join(',')});` : ''}`
    );
  }
  if (originalIntegration) {
    sql(
      `UPDATE ai_integrations SET active_chat_connection_id = ${originalIntegration.active_chat_connection_id ? `'${originalIntegration.active_chat_connection_id}'::uuid` : 'NULL'}, active_embedding_connection_id = ${originalIntegration.active_embedding_connection_id ? `'${originalIntegration.active_embedding_connection_id}'::uuid` : 'NULL'}, active_embedding_index_version_id = ${originalIntegration.active_embedding_index_version_id ? `'${originalIntegration.active_embedding_index_version_id}'::uuid` : 'NULL'}, generation_enabled = ${originalIntegration.generation_enabled}, retrieval_enabled = ${originalIntegration.retrieval_enabled}, status = '${originalIntegration.status}', revision = ${originalIntegration.revision}, updated_at = NOW() WHERE id = '${originalIntegration.id}'::uuid`
    );
  } else {
    sql(`DELETE FROM ai_integrations WHERE tenant_id = '${tenantId}'::uuid AND name = 'default'`);
  }
}
