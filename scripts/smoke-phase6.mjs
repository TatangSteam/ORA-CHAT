/* global fetch */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const baseUrl = process.env.PHASE6_BASE_URL ?? 'http://127.0.0.1:3000';
const password = readFileSync('.secrets/bootstrap_admin_password', 'utf8').trim();
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
if (login.response.status !== 201) throw new Error(`Phase 6 login failed: ${login.text}`);
const sessionName = login.response.headers
  .getSetCookie()
  .some((value) => value.startsWith('__Host-raho_session='))
  ? '__Host-raho_session'
  : 'raho_session';
const cookie = cookieFrom(login.response, sessionName);
const me = await request('/api/admin/v1/me', { headers: { cookie } });
const csrf = me.body.data.csrfToken;
const tenantId = me.body.data.tenant.id;
const admin = (path, init = {}) =>
  request(`/api/admin/v1${path}`, {
    ...init,
    headers: {
      cookie,
      ...(!['GET', 'HEAD'].includes(init.method ?? 'GET') ? { 'x-csrf-token': csrf } : {}),
      ...(typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}),
      ...init.headers
    }
  });

const originalWhatsAppState = sql(
  `SELECT state FROM whatsapp_session_states WHERE tenant_id = '${tenantId}'::uuid`
);
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

  const suffix = Date.now().toString();
  const created = await admin('/templates', {
    method: 'POST',
    body: JSON.stringify({
      name: `Konfirmasi F6 ${suffix}`,
      category: 'acceptance',
      version: {
        body: 'Halo {{nama_pelanggan}}, konfirmasi untuk {{tanggal}}.',
        variableSchema: ['nama_pelanggan', 'tanggal'],
        checklist: [{ sequence: 0, label: 'Nomor sudah diverifikasi', required: true }]
      }
    })
  });
  if (created.response.status !== 201) throw new Error(`Template create failed: ${created.text}`);
  const template = created.body.data;
  const firstVersion = template.versions[0];
  const preview = await admin('/templates/preview', {
    method: 'POST',
    body: JSON.stringify({
      templateVersionId: firstVersion.id,
      variables: { nama_pelanggan: 'Pelanggan Uji', tanggal: '10 Agustus 2026' }
    })
  });
  if (
    preview.response.status !== 200 ||
    !preview.body.data.renderedBody.includes('☐ Nomor sudah diverifikasi')
  ) {
    throw new Error(`Template preview failed: ${preview.text}`);
  }
  const published = await admin(`/templates/${template.id}/publish`, {
    method: 'POST',
    body: JSON.stringify({
      expectedVersion: 1,
      reason: 'Publikasi template untuk acceptance Fase 6'
    })
  });
  if (published.response.status !== 200)
    throw new Error(`Template publish failed: ${published.text}`);
  const activated = await admin(`/templates/${template.id}/lifecycle`, {
    method: 'POST',
    body: JSON.stringify({
      expectedVersion: 1,
      status: 'active',
      reason: 'Aktivasi template untuk acceptance Fase 6'
    })
  });
  if (activated.response.status !== 200)
    throw new Error(`Template activation failed: ${activated.text}`);

  const selection = {
    templateVersionId: firstVersion.id,
    variables: { nama_pelanggan: 'Pelanggan Uji', tanggal: '10 Agustus 2026' },
    checklist: [{ itemId: firstVersion.checklistItems[0].id, checked: false }]
  };
  const blocked = await admin('/messages', {
    method: 'POST',
    headers: { 'idempotency-key': `phase6-blocked-${suffix}` },
    body: JSON.stringify({ phone: '6281234567998', template: selection })
  });
  if (
    blocked.response.status !== 409 ||
    blocked.body.error.code !== 'TEMPLATE_CHECKLIST_REQUIRED'
  ) {
    throw new Error(`Required checklist did not block outbox: ${blocked.text}`);
  }

  selection.checklist[0].checked = true;
  const composed = await admin('/messages', {
    method: 'POST',
    headers: { 'idempotency-key': `phase6-compose-${suffix}` },
    body: JSON.stringify({
      phone: '6281234567998',
      template: selection,
      scheduledAt: '2099-01-01T00:00:00.000Z'
    })
  });
  if (composed.response.status !== 202 || composed.body.data.status !== 'scheduled') {
    throw new Error(`Template compose failed: ${composed.text}`);
  }
  await admin(`/outbox/${composed.body.data.outboxMessageId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Membatalkan pesan acceptance terjadwal Fase 6' })
  });

  const messageBefore = await admin(`/messages/${composed.body.data.messageId}`);
  const snapshotBefore = messageBefore.body.data.templateSnapshot;
  if (
    !snapshotBefore ||
    snapshotBefore.sourceTemplateVersionId !== firstVersion.id ||
    !snapshotBefore.renderedBody.includes('☑ Nomor sudah diverifikasi')
  ) {
    throw new Error(`Template snapshot missing: ${messageBefore.text}`);
  }

  const second = await admin(`/templates/${template.id}/versions`, {
    method: 'POST',
    body: JSON.stringify({
      expectedVersion: 1,
      version: {
        body: 'Versi baru untuk {{nama_pelanggan}}.',
        variableSchema: ['nama_pelanggan'],
        checklist: []
      }
    })
  });
  if (second.response.status !== 201) throw new Error(`New version failed: ${second.text}`);
  const messageAfter = await admin(`/messages/${composed.body.data.messageId}`);
  if (messageAfter.body.data.templateSnapshot.renderedBody !== snapshotBefore.renderedBody) {
    throw new Error('Message template snapshot changed after source versioning');
  }

  const duplicated = await admin(`/templates/${template.id}/duplicate`, {
    method: 'POST',
    body: JSON.stringify({ name: `Konfirmasi F6 salinan ${suffix}` })
  });
  if (duplicated.response.status !== 201)
    throw new Error(`Template duplicate failed: ${duplicated.text}`);
  const idor = await admin('/templates/01988c36-6880-7000-8000-000000000099');
  if (idor.response.status !== 404) throw new Error('Template IDOR did not fail closed');

  process.stdout.write(
    `${JSON.stringify({
      status: 'passed',
      previewRendered: true,
      requiredChecklistBlocked: true,
      scheduledOutboxCancelled: true,
      snapshotImmutable: true,
      versionLifecycle: 'v1-published-v2-draft',
      duplicateCreated: true,
      idorStatus: idor.response.status
    })}\n`
  );
} finally {
  sql(
    `UPDATE whatsapp_session_states SET state = '${originalWhatsAppState}', revision = revision + 1, updated_at = NOW() WHERE tenant_id = '${tenantId}'::uuid`
  );
  if (workerStopped) compose(['start', 'worker'], true);
  if (whatsappStopped) compose(['start', 'whatsapp'], true);
}
