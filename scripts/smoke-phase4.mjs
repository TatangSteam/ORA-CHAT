/* global fetch, setTimeout */
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import process from 'node:process';

const baseUrl = process.env.PHASE4_BASE_URL ?? 'http://127.0.0.1:3000';
const password = readFileSync(
  process.env.BOOTSTRAP_ADMIN_PASSWORD_FILE ?? '.secrets/bootstrap_admin_password',
  'utf8'
).trim();
const internalToken = readFileSync('.secrets/whatsapp_internal_token', 'utf8').trim();

const cookieFrom = (response, name) => {
  const header = response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
  const value = header?.match(new RegExp(`^${name}=([^;]*)`, 'u'))?.[1];
  if (!value) throw new Error(`${name} cookie missing`);
  return `${name}=${value}`;
};

const request = async (path, init = {}) => {
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

const internalRequest = async (path, init = {}) => {
  const response = await fetch(`http://127.0.0.1:4000${path}`, init);
  const text = await response.text();
  return { response, body: JSON.parse(text), text };
};

const waitFor = async (read, predicate, label, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const docxFixture = (text) => {
  const name = Buffer.from('word/document.xml');
  const source = Buffer.from(
    `<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`
  );
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt32LE(source.length, 18);
  local.writeUInt32LE(source.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt32LE(source.length, 20);
  central.writeUInt32LE(source.length, 24);
  central.writeUInt16LE(name.length, 28);
  const centralOffset = local.length + name.length + source.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + name.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, name, source, central, name, eocd]);
};

const preLogin = await request('/api/admin/v1/auth/csrf');
const loginCookie = cookieFrom(preLogin.response, 'raho_login_csrf');
const login = await request('/api/admin/v1/auth/login', {
  method: 'POST',
  headers: {
    cookie: loginCookie,
    'content-type': 'application/json',
    'x-csrf-token': preLogin.body.data.csrfToken
  },
  body: JSON.stringify({ tenantSlug: 'default', username: 'superadmin', password })
});
if (login.response.status !== 201) throw new Error(`Phase 4 login failed: ${login.text}`);
const sessionName = login.response.headers
  .getSetCookie()
  .some((value) => value.startsWith('__Host-raho_session='))
  ? '__Host-raho_session'
  : 'raho_session';
const cookie = cookieFrom(login.response, sessionName);
const me = await request('/api/admin/v1/me', { headers: { cookie } });
if (me.response.status !== 200) throw new Error('Phase 4 session failed');
const csrf = me.body.data.csrfToken;

const admin = (path, init = {}) =>
  request(`/api/admin/v1${path}`, {
    ...init,
    headers: {
      cookie,
      ...(!['GET', 'HEAD'].includes(init.method ?? 'GET') ? { 'x-csrf-token': csrf } : {}),
      ...(init.body && typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}),
      ...init.headers
    }
  });

const suffix = Date.now().toString();
const integrationRead = await admin('/ai/integration');
if (integrationRead.response.status !== 200) throw new Error('Integration read failed');
let integration = integrationRead.body.data;

const createAndTest = async (purpose) => {
  const create = await admin('/ai/provider-connections', {
    method: 'POST',
    body: JSON.stringify({
      name: `phase4-${purpose}-${suffix}`,
      purpose,
      provider: 'mock',
      transport: 'native',
      baseUrl: null,
      modelId: purpose === 'chat' ? 'mock-safe' : 'mock-embedding-v1',
      dimensions: purpose === 'embedding' ? 8 : null,
      taskType: purpose === 'embedding' ? 'RETRIEVAL_QUERY' : null,
      timeoutMs: 5_000,
      maxRetries: 0,
      maxOutputTokens: 256,
      generationConfig: {},
      reason: `Acceptance otomatis provider ${purpose} Fase 4`
    })
  });
  if (create.response.status !== 201) throw new Error(`Create ${purpose} failed: ${create.text}`);
  const tested = await admin(`/ai/provider-connections/${create.body.data.id}/test`, {
    method: 'POST',
    body: JSON.stringify({
      expectedRevision: create.body.data.revision,
      reason: `Acceptance otomatis test ${purpose} Fase 4`
    })
  });
  if (tested.response.status !== 200 || tested.body.data.test.healthState !== 'ready') {
    throw new Error(`Test ${purpose} failed: ${tested.text}`);
  }
  const activated = await admin('/ai/integration/activate', {
    method: 'POST',
    body: JSON.stringify({
      purpose,
      connectionId: create.body.data.id,
      expectedRevision: integration.revision,
      reason: `Acceptance otomatis aktivasi ${purpose} Fase 4`
    })
  });
  if (activated.response.status !== 200) throw new Error(`Activate ${purpose} failed`);
  integration = activated.body.data;
};

await createAndTest('chat');
await createAndTest('embedding');

const knowledge = await admin('/ai/knowledge', {
  method: 'POST',
  body: JSON.stringify({
    categoryId: null,
    title: `Jam layanan Phase 4 ${suffix}`,
    answer: 'Layanan tersedia Senin sampai Jumat pukul 08.00 sampai 16.00 WIB.',
    questionVariants: ['Kapan layanan buka?', 'Jam operasional berapa?'],
    reason: 'Acceptance otomatis membuat knowledge Fase 4'
  })
});
if (knowledge.response.status !== 201)
  throw new Error(`Knowledge create failed: ${knowledge.text}`);
let item = knowledge.body.data;
for (const target of ['in_review', 'approved', 'published']) {
  const transitioned = await admin(`/ai/knowledge/${item.id}/lifecycle`, {
    method: 'POST',
    body: JSON.stringify({
      target,
      expectedRevision: item.revision,
      reason: `Acceptance otomatis transisi ${target} Fase 4`
    })
  });
  if (transitioned.response.status !== 200) {
    throw new Error(`Knowledge transition ${target} failed: ${transitioned.text}`);
  }
  item = transitioned.body.data;
}

const indexed = await waitFor(
  () => admin('/ai/integration'),
  (value) => value.body.data.retrievalEnabled && value.body.data.activeEmbeddingIndexVersionId,
  'first active embedding index'
);
integration = indexed.body.data;

const search = await admin('/ai/search/test', {
  method: 'POST',
  body: JSON.stringify({ query: 'Kapan jam layanan buka?', limit: 5 })
});
if (search.response.status !== 200 || search.body.data.results.length === 0) {
  throw new Error(`Tenant-scoped retrieval failed: ${search.text}`);
}

const answer = await admin('/ai/playground', {
  method: 'POST',
  body: JSON.stringify({ question: 'Kapan jam layanan buka?' })
});
if (
  answer.response.status !== 200 ||
  answer.body.data.status !== 'answered' ||
  answer.body.data.sources.length === 0
) {
  throw new Error(`Grounded answer or citation failed: ${answer.text}`);
}

const emergency = await admin('/ai/playground', {
  method: 'POST',
  body: JSON.stringify({ question: 'Saya nyeri dada dan sesak napas, apa diagnosisnya?' })
});
if (
  emergency.response.status !== 200 ||
  emergency.body.data.status !== 'handoff' ||
  emergency.body.data.sources.length !== 0
) {
  throw new Error(`Emergency fallback failed: ${emergency.text}`);
}

const inboundPayload = {
  tenantId: me.body.data.tenant.id,
  providerEventId: `phase4-rag-event-${suffix}`,
  providerMessageId: `phase4-rag-message-${suffix}`,
  senderJid: `62815${suffix.slice(-8)}@s.whatsapp.net`,
  displayName: 'Inbound RAG Phase 4',
  content: `Pertanyaan unik ${suffix}: kapan jam layanan buka?`,
  occurredAt: new Date().toISOString()
};
const inbound = await internalRequest('/internal/v1/whatsapp/inbound', {
  method: 'POST',
  headers: { authorization: `Bearer ${internalToken}`, 'content-type': 'application/json' },
  body: JSON.stringify(inboundPayload)
});
if (
  inbound.response.status !== 202 ||
  !inbound.body.data.aiAutomation?.outboxMessageId ||
  !inbound.body.data.aiAutomation?.traceId
) {
  throw new Error(`Inbound RAG did not create durable AI outbox: ${inbound.text}`);
}
const inboundDuplicate = await internalRequest('/internal/v1/whatsapp/inbound', {
  method: 'POST',
  headers: { authorization: `Bearer ${internalToken}`, 'content-type': 'application/json' },
  body: JSON.stringify(inboundPayload)
});
if (inboundDuplicate.response.status !== 200 || !inboundDuplicate.body.data.duplicate) {
  throw new Error('Inbound RAG event was not idempotent');
}

const documentContent = Buffer.from(
  `Dokumen Phase 4 ${suffix}. Alamat layanan berada di Jakarta dan buka pada hari kerja.`,
  'utf8'
);
const uploaded = await admin('/ai/documents', {
  method: 'POST',
  headers: { 'content-type': 'text/plain', 'x-file-name': `phase4-${suffix}.txt` },
  body: documentContent
});
if (uploaded.response.status !== 202 || !uploaded.body.data.dispatchSignal) {
  throw new Error(`Private document upload failed: ${uploaded.text}`);
}
const readyDocument = await waitFor(
  () => admin('/ai/documents'),
  (value) =>
    value.body.data.some(
      (document) => document.id === uploaded.body.data.id && document.state === 'ready'
    ),
  'document ready state'
);
const ready = readyDocument.body.data.find((document) => document.id === uploaded.body.data.id);
if (!ready.storageObjects.some((object) => object.role === 'source' && object.verifiedAt)) {
  throw new Error('Final source object was not verified');
}

for (const fixture of [
  {
    filename: `phase4-${suffix}.pdf`,
    mime: 'application/pdf',
    content: Buffer.from('%PDF-1.4\nBT (Dokumen PDF Phase 4 terverifikasi) Tj ET\n%%EOF', 'latin1')
  },
  {
    filename: `phase4-${suffix}.docx`,
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    content: docxFixture('Dokumen DOCX Phase 4 terverifikasi')
  }
]) {
  const response = await admin('/ai/documents', {
    method: 'POST',
    headers: { 'content-type': fixture.mime, 'x-file-name': fixture.filename },
    body: fixture.content
  });
  if (response.response.status !== 202) throw new Error(`${fixture.mime} upload failed`);
  await waitFor(
    () => admin('/ai/documents'),
    (value) =>
      value.body.data.some(
        (document) => document.id === response.body.data.id && document.state === 'ready'
      ),
    `${fixture.mime} ready state`
  );
}

const invalidContent = Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE', 'utf8');
const invalidUpload = await admin('/ai/documents', {
  method: 'POST',
  headers: { 'content-type': 'text/plain', 'x-file-name': `phase4-invalid-${suffix}.txt` },
  body: invalidContent
});
if (invalidUpload.response.status !== 202) throw new Error('Invalid fixture upload failed');
const failedDocument = await waitFor(
  () => admin('/ai/documents'),
  (value) =>
    value.body.data.some(
      (document) => document.id === invalidUpload.body.data.id && document.state === 'failed'
    ),
  'invalid document rejection'
);
let failed = failedDocument.body.data.find(
  (document) => document.id === invalidUpload.body.data.id
);
if (failed.failureCode !== 'MALWARE_DETECTED') throw new Error('Invalid file reached extraction');
const retried = await admin(`/ai/documents/${failed.id}/retry`, {
  method: 'POST',
  body: JSON.stringify({
    expectedRevision: failed.revision,
    reason: 'Acceptance retry idempotency dokumen invalid Fase 4'
  })
});
if (retried.response.status !== 200) throw new Error(`Document retry failed: ${retried.text}`);
failed = await waitFor(
  () => admin('/ai/documents'),
  (value) =>
    value.body.data.find((document) => document.id === invalidUpload.body.data.id)?.state ===
    'failed',
  'retried document failure'
).then((value) => value.body.data.find((document) => document.id === invalidUpload.body.data.id));
if (failed.retryCount !== 1) throw new Error('Retry count did not advance exactly once');

const randomIdor = await admin('/ai/documents/01988c36-6880-7000-8000-000000000099/download');
if (randomIdor.response.status !== 404) throw new Error('Document IDOR failed closed');

process.stdout.write(
  `${JSON.stringify({
    status: 'passed',
    indexVersionId: integration.activeEmbeddingIndexVersionId,
    retrievalResults: search.body.data.results.length,
    citations: answer.body.data.sources.length,
    emergency: emergency.body.data.status,
    inboundOutbox: Boolean(inbound.body.data.aiAutomation.outboxMessageId),
    documentState: ready.state,
    formats: ['txt', 'pdf', 'docx'],
    invalidFailure: failed.failureCode,
    retryCount: failed.retryCount,
    idorStatus: randomIdor.response.status
  })}\n`
);
