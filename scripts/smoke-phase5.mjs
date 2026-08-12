/* global fetch */
import { readFileSync } from 'node:fs';
import process from 'node:process';

const baseUrl = process.env.PHASE5_BASE_URL ?? 'http://127.0.0.1:3000';
const password = readFileSync('.secrets/bootstrap_admin_password', 'utf8').trim();
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
    throw new Error(`${path} returned ${response.status}: ${text}`);
  }
  return { response, body, text };
};

const preLogin = await request('/api/admin/v1/auth/csrf');
const login = await request('/api/admin/v1/auth/login', {
  method: 'POST',
  headers: {
    cookie: cookieFrom(preLogin.response, 'raho_login_csrf'),
    'content-type': 'application/json',
    'x-csrf-token': preLogin.body.data.csrfToken
  },
  body: JSON.stringify({ tenantSlug: 'default', username: 'superadmin', password })
});
if (login.response.status !== 201) throw new Error(`Phase 5 login failed: ${login.text}`);
const sessionName = login.response.headers
  .getSetCookie()
  .some((value) => value.startsWith('__Host-raho_session='))
  ? '__Host-raho_session'
  : 'raho_session';
const cookie = cookieFrom(login.response, sessionName);
const me = await request('/api/admin/v1/me', { headers: { cookie } });
const csrf = me.body.data.csrfToken;
const traceId = '1234567890abcdef1234567890abcdef';
const admin = (path, init = {}) =>
  request(`/api/admin/v1${path}`, {
    ...init,
    headers: {
      cookie,
      traceparent: `00-${traceId}-1234567890abcdef-01`,
      ...(!['GET', 'HEAD'].includes(init.method ?? 'GET') ? { 'x-csrf-token': csrf } : {}),
      ...(typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}),
      ...init.headers
    }
  });

let integration = (await admin('/ai/integration')).body.data;
if (!integration.activeChatConnectionId || !integration.activeEmbeddingConnectionId) {
  throw new Error('Phase 4 active provider fixtures are required');
}
const activeChatConnectionId = integration.activeChatConnectionId;
const deactivated = await admin('/ai/integration/deactivate', {
  method: 'POST',
  body: JSON.stringify({
    purpose: 'chat',
    expectedRevision: integration.revision,
    reason: 'Failure injection unanswered Fase 5'
  })
});
if (deactivated.response.status !== 200)
  throw new Error(`Chat deactivate failed: ${deactivated.text}`);
integration = deactivated.body.data;
const suffix = Date.now().toString();
const unsupportedQuestion = `Pertanyaan tanpa provider ${suffix} nomor 081234567890`;
const fallback = await admin('/ai/playground', {
  method: 'POST',
  body: JSON.stringify({ question: unsupportedQuestion })
});
if (fallback.response.status !== 200 || fallback.body.data.status !== 'fallback') {
  throw new Error(`Fallback aggregation setup failed: ${fallback.text}`);
}
const reactivated = await admin('/ai/integration/activate', {
  method: 'POST',
  body: JSON.stringify({
    purpose: 'chat',
    connectionId: activeChatConnectionId,
    expectedRevision: integration.revision,
    reason: 'Memulihkan provider chat setelah failure injection'
  })
});
if (reactivated.response.status !== 200)
  throw new Error(`Chat restore failed: ${reactivated.text}`);

for (const feedback of [
  { rating: 'incomplete', category: 'too_long' },
  { rating: 'incorrect', category: 'wrong_source' }
]) {
  const reviewed = await admin(`/ai/traces/${fallback.body.data.id}/feedback`, {
    method: 'POST',
    body: JSON.stringify({
      ...feedback,
      note: 'Acceptance Fase 5',
      reason: 'Review acceptance append-only Fase 5'
    })
  });
  if (reviewed.response.status !== 200) throw new Error(`Feedback failed: ${reviewed.text}`);
}
const audit = await admin('/audit?limit=100');
const feedbackAudits = audit.body.data.filter(
  (entry) =>
    ['ai.feedback.created', 'ai.feedback.revised'].includes(entry.action) &&
    entry.metadata.traceId === fallback.body.data.id
);
if (feedbackAudits.length !== 2)
  throw new Error('Feedback revisions did not produce two audit records');

const unanswered = await admin('/ai/unanswered?status=open&limit=100');
const aggregate = unanswered.body.data.find((item) => item.representativeQuestion.includes(suffix));
if (!aggregate || aggregate.representativeQuestion.includes('081234567890')) {
  throw new Error('Unanswered aggregation or PII redaction failed');
}
const draft = await admin(`/ai/unanswered/${aggregate.id}/draft`, {
  method: 'POST',
  body: JSON.stringify({
    title: `Draft unanswered ${suffix}`,
    answer: 'Jawaban ini masih berupa draft dan wajib melalui review sebelum dipublikasikan.',
    categoryId: null,
    reason: 'Mengubah unanswered menjadi draft knowledge pada acceptance Fase 5'
  })
});
if (draft.response.status !== 201 || draft.body.data.status !== 'drafted') {
  throw new Error(`Unanswered draft conversion failed: ${draft.text}`);
}

const testCase = await admin('/ai/test-cases', {
  method: 'POST',
  body: JSON.stringify({
    name: `Phase 5 grounded ${suffix}`,
    input: 'Kapan jam layanan buka?',
    expectedBehavior: {
      status: 'answered',
      requireCitation: true,
      forbiddenTerms: ['jaminan mutlak'],
      maxLatencyMs: 30000
    },
    reason: 'Membuat evaluation dataset acceptance Fase 5'
  })
});
if (testCase.response.status !== 201) throw new Error(`Test case create failed: ${testCase.text}`);
const run = await admin('/ai/test-runs', {
  method: 'POST',
  body: JSON.stringify({
    testCaseIds: [testCase.body.data.id],
    reason: 'Menjalankan evaluation batch acceptance Fase 5'
  })
});
if (run.response.status !== 201 || run.body.data[0].status !== 'passed') {
  throw new Error(`Evaluation run failed: ${run.text}`);
}

const analytics = await admin('/ai/analytics?days=7');
if (
  analytics.response.status !== 200 ||
  analytics.body.data.total < 1 ||
  !Array.isArray(analytics.body.data.providers)
) {
  throw new Error(`Analytics failed: ${analytics.text}`);
}
if (analytics.body.meta.traceId !== traceId)
  throw new Error('W3C trace context was not propagated');

const readiness = await admin('/ai/release-readiness/evaluate', {
  method: 'POST',
  body: JSON.stringify({
    minimumScore: 0,
    reason: 'Mengevaluasi readiness fail-closed acceptance Fase 5'
  })
});
if (
  readiness.response.status !== 201 ||
  readiness.body.data.status !== 'blocked' ||
  !readiness.body.data.blockers.includes('externalEvidence')
) {
  throw new Error(`Readiness did not fail closed: ${readiness.text}`);
}
const invalidApproval = await admin(`/ai/release-readiness/${readiness.body.data.id}/decision`, {
  method: 'POST',
  body: JSON.stringify({
    expectedRevision: readiness.body.data.revision,
    status: 'approved',
    pilotPercentage: 10,
    reason: 'Menguji penolakan approval saat gate masih blocked'
  })
});
if (invalidApproval.response.status !== 409) throw new Error('Blocked readiness could be approved');

const idor = await admin('/ai/traces/01988c36-6880-7000-8000-000000000099/feedback', {
  method: 'POST',
  body: JSON.stringify({
    rating: 'correct',
    category: 'correct',
    note: null,
    reason: 'Menguji isolasi tenant resource feedback'
  })
});
if (idor.response.status !== 404) throw new Error('Trace feedback IDOR failed closed');

process.stdout.write(
  `${JSON.stringify({
    status: 'passed',
    feedbackAuditRecords: feedbackAudits.length,
    unansweredRedacted: true,
    knowledgeDrafted: draft.body.data.status,
    evaluationStatus: run.body.data[0].status,
    analyticsTraces: analytics.body.data.total,
    traceContext: analytics.body.meta.traceId === traceId,
    readinessStatus: readiness.body.data.status,
    readinessBlocker: 'externalEvidence',
    idorStatus: idor.response.status
  })}\n`
);
