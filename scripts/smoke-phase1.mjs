/* global fetch */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const baseUrl = process.env.PHASE1_BASE_URL ?? 'http://127.0.0.1:3000';
const passwordPath =
  process.env.BOOTSTRAP_ADMIN_PASSWORD_FILE ?? '.secrets/bootstrap_admin_password';
const password = readFileSync(passwordPath, 'utf8').trimEnd();

const cookieFrom = (response, name) => {
  const header = response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
  const match = header?.match(new RegExp(`^${name}=([^;]*)`, 'u'));
  if (!match?.[1]) throw new Error(`${name} cookie was not issued`);
  return `${name}=${match[1]}`;
};

const requestJson = async (path, init = {}) => {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${path} did not return JSON`);
  }
  return { response, body, text };
};

const csrf = await requestJson('/api/admin/v1/auth/csrf');
if (csrf.response.status !== 200) throw new Error('Pre-login CSRF failed');
const preSessionCookie = cookieFrom(csrf.response, 'raho_login_csrf');
const login = await requestJson('/api/admin/v1/auth/login', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    cookie: preSessionCookie,
    'x-csrf-token': csrf.body.data.csrfToken
  },
  body: JSON.stringify({ tenantSlug: 'default', username: 'superadmin', password })
});
if (login.response.status !== 201) throw new Error('Bootstrap admin login failed');
const sessionCookieName = login.response.headers
  .getSetCookie()
  .some((value) => value.startsWith('__Host-raho_session='))
  ? '__Host-raho_session'
  : 'raho_session';
const sessionCookie = cookieFrom(login.response, sessionCookieName);
const rawSessionToken = decodeURIComponent(sessionCookie.split('=')[1]);
if (login.text.includes(rawSessionToken))
  throw new Error('Session token leaked into login response');

const me = await requestJson('/api/admin/v1/me', { headers: { cookie: sessionCookie } });
if (me.response.status !== 200 || me.body.data.membership.role !== 'super_admin') {
  throw new Error('Session identity check failed');
}
const overview = await requestJson('/api/admin/v1/overview', {
  headers: { cookie: sessionCookie }
});
if (
  overview.response.status !== 200 ||
  !Array.isArray(overview.body.data.dependencies) ||
  typeof overview.body.data.metricsAvailable !== 'boolean'
) {
  throw new Error('Operational overview check failed');
}
const audit = await requestJson('/api/admin/v1/audit', { headers: { cookie: sessionCookie } });
if (audit.response.status !== 200 || !Array.isArray(audit.body.data)) {
  throw new Error('Audit read check failed');
}
const originalSafety = await requestJson('/api/admin/v1/safety/stats', {
  headers: { cookie: sessionCookie }
});
if (originalSafety.response.status !== 200) throw new Error('Safety state check failed');
const firstSafetyAction = originalSafety.body.data.sendingPaused ? 'resume' : 'pause';
const restoreSafetyAction = originalSafety.body.data.sendingPaused ? 'pause' : 'resume';
let safetyRevision = originalSafety.body.data.revision;
let safetyRestored = false;
try {
  const mutationBody = JSON.stringify({
    expectedRevision: safetyRevision,
    reason: 'UAT otomatis Fase 1'
  });
  const changedSafety = await requestJson(`/api/admin/v1/safety/${firstSafetyAction}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: sessionCookie,
      'x-csrf-token': me.body.data.csrfToken
    },
    body: mutationBody
  });
  if (changedSafety.response.status !== 200) throw new Error('Safety mutation UAT failed');
  safetyRevision = changedSafety.body.data.revision;

  const staleSafety = await requestJson(`/api/admin/v1/safety/${firstSafetyAction}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: sessionCookie,
      'x-csrf-token': me.body.data.csrfToken
    },
    body: mutationBody
  });
  if (staleSafety.response.status !== 409) {
    throw new Error('Stale safety revision was not rejected');
  }

  const restoredSafety = await requestJson(`/api/admin/v1/safety/${restoreSafetyAction}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: sessionCookie,
      'x-csrf-token': me.body.data.csrfToken
    },
    body: JSON.stringify({
      expectedRevision: safetyRevision,
      reason: 'Pemulihan UAT Fase 1'
    })
  });
  if (
    restoredSafety.response.status !== 200 ||
    restoredSafety.body.data.sendingPaused !== originalSafety.body.data.sendingPaused
  ) {
    throw new Error('Safety state was not restored after UAT');
  }
  safetyRestored = true;
} finally {
  if (!safetyRestored) {
    const current = await requestJson('/api/admin/v1/safety/stats', {
      headers: { cookie: sessionCookie }
    });
    if (
      current.response.status === 200 &&
      current.body.data.sendingPaused !== originalSafety.body.data.sendingPaused
    ) {
      await requestJson(`/api/admin/v1/safety/${restoreSafetyAction}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: sessionCookie,
          'x-csrf-token': me.body.data.csrfToken
        },
        body: JSON.stringify({
          expectedRevision: current.body.data.revision,
          reason: 'Pemulihan darurat UAT Fase 1'
        })
      });
    }
  }
}
const sessionState = await requestJson('/api/admin/v1/session', {
  headers: { cookie: sessionCookie }
});
if (sessionState.response.status !== 200) throw new Error('WhatsApp session state check failed');
const unauthorizedQr = await fetch(`${baseUrl}/api/admin/v1/session/qr`, { cache: 'no-store' });
if (unauthorizedQr.status !== 401)
  throw new Error('QR endpoint allowed an unauthenticated request');
const qr = await fetch(`${baseUrl}/api/admin/v1/session/qr`, {
  headers: { cookie: sessionCookie },
  cache: 'no-store'
});
let qrPng = false;
if (sessionState.body.data.state === 'qr_required') {
  if (qr.status !== 200 || qr.headers.get('content-type') !== 'image/png') {
    throw new Error('Ephemeral QR was not returned as PNG');
  }
  const qrBytes = new Uint8Array(await qr.arrayBuffer());
  qrPng =
    qrBytes.length > 8 &&
    qrBytes[0] === 0x89 &&
    qrBytes[1] === 0x50 &&
    qrBytes[2] === 0x4e &&
    qrBytes[3] === 0x47;
  if (!qrPng) throw new Error('QR response did not contain a valid PNG signature');
} else if (qr.status !== 503) {
  throw new Error('QR endpoint must be unavailable outside qr_required state');
}
const logout = await requestJson('/api/admin/v1/auth/logout', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    cookie: sessionCookie,
    'x-csrf-token': me.body.data.csrfToken
  },
  body: '{}'
});
if (logout.response.status !== 200) throw new Error('Logout failed');
const revoked = await requestJson('/api/admin/v1/me', { headers: { cookie: sessionCookie } });
if (revoked.response.status !== 401) throw new Error('Revoked session remained usable');

const logResult = spawnSync(
  'docker',
  ['compose', '--env-file', '.env.example', 'logs', '--no-color', 'api', 'web'],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
);
if (logResult.error || logResult.status !== 0) throw new Error('Unable to scan application logs');
if (logResult.stdout.includes(password) || logResult.stdout.includes(rawSessionToken)) {
  throw new Error('Password or session token leaked into application logs');
}

process.stdout.write(
  `${JSON.stringify({
    auditRecords: audit.body.data.length,
    dependencies: overview.body.data.dependencies.length,
    login: login.response.status,
    logout: logout.response.status,
    qrPng,
    qrState: sessionState.body.data.state,
    revokedSession: revoked.response.status,
    runtimeLogScan: 'passed',
    safetyRevisionConflict: 409,
    safetyRestored,
    status: 'passed'
  })}\n`
);
