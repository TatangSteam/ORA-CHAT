import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const compose = (args) => {
  const result = spawnSync('docker', ['compose', '--env-file', '.env.example', ...args], {
    encoding: 'utf8'
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(result.stderr || `docker compose ${args.join(' ')} failed`);
  return result.stdout.trim();
};

const psql = (sql) =>
  compose([
    'exec',
    '-T',
    'postgres',
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'raho_app',
    '-d',
    'raho_chatbot',
    '-Atc',
    sql
  ]);

const membership = psql(
  'SELECT id, admin_user_id, tenant_id FROM admin_tenant_memberships ORDER BY created_at LIMIT 1'
).split('|');
if (membership.length !== 3) throw new Error('Retention fixture membership is unavailable');
const [membershipId, adminUserId, tenantId] = membership;
const oldSessionId = randomUUID();
const controlSessionId = randomUUID();
const expiredIdempotencyId = randomUUID();
const controlIdempotencyId = randomUUID();
const hash = (value) => createHash('sha256').update(value).digest('hex');

const insert = (id, tokenHash, ageDays, revokedDays, expiresDays) =>
  psql(`
    INSERT INTO admin_sessions (
      id, membership_id, admin_user_id, tenant_id, token_hash, csrf_secret_hash,
      ip_hash, user_agent_hash, expires_at, idle_expires_at, revoked_at,
      revoked_reason, created_at, last_seen_at
    ) VALUES (
      '${id}', '${membershipId}', '${adminUserId}', '${tenantId}', '${tokenHash}',
      '${hash(`${id}:csrf`)}', '${hash(`${id}:ip`)}', '${hash(`${id}:ua`)}',
      CURRENT_TIMESTAMP + INTERVAL '${expiresDays} days',
      CURRENT_TIMESTAMP + INTERVAL '${expiresDays - 1} days',
      CURRENT_TIMESTAMP - INTERVAL '${revokedDays} days', 'retention_probe',
      CURRENT_TIMESTAMP - INTERVAL '${ageDays} days', CURRENT_TIMESTAMP - INTERVAL '${ageDays} days'
    )
  `);

try {
  insert(oldSessionId, hash(`${oldSessionId}:token`), 40, 31, -31);
  insert(controlSessionId, hash(`${controlSessionId}:token`), 29, 29, 1);
  psql(`
    INSERT INTO idempotency_keys (
      id, tenant_id, scope, key, request_hash, resource_type, resource_id,
      response_status, response_snapshot, expires_at
    ) VALUES
      ('${expiredIdempotencyId}', '${tenantId}', 'retention_probe', '${expiredIdempotencyId}', '${hash(expiredIdempotencyId)}', 'message', '${randomUUID()}', 202, '{}', CURRENT_TIMESTAMP - INTERVAL '1 second'),
      ('${controlIdempotencyId}', '${tenantId}', 'retention_probe', '${controlIdempotencyId}', '${hash(controlIdempotencyId)}', 'message', '${randomUUID()}', 202, '{}', CURRENT_TIMESTAMP + INTERVAL '1 day')
  `);
  compose(['restart', 'worker']);

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const expiredCounts = psql(
      `SELECT (SELECT count(*) FROM admin_sessions WHERE id = '${oldSessionId}') || '|' || (SELECT count(*) FROM idempotency_keys WHERE id = '${expiredIdempotencyId}')`
    );
    if (expiredCounts === '0|0') break;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
  }

  const oldCount = psql(`SELECT count(*) FROM admin_sessions WHERE id = '${oldSessionId}'`);
  const controlCount = psql(`SELECT count(*) FROM admin_sessions WHERE id = '${controlSessionId}'`);
  const expiredIdempotencyCount = psql(
    `SELECT count(*) FROM idempotency_keys WHERE id = '${expiredIdempotencyId}'`
  );
  const controlIdempotencyCount = psql(
    `SELECT count(*) FROM idempotency_keys WHERE id = '${controlIdempotencyId}'`
  );
  if (
    oldCount !== '0' ||
    controlCount !== '1' ||
    expiredIdempotencyCount !== '0' ||
    controlIdempotencyCount !== '1'
  ) {
    throw new Error('Retention did not preserve the session/idempotency boundaries');
  }
  process.stdout.write(
    `${JSON.stringify({ expiredIdempotencyDeleted: true, oldRevokedSessionDeleted: true, recentIdempotencyPreserved: true, recentRevokedSessionPreserved: true, status: 'passed' })}\n`
  );
} finally {
  psql(`DELETE FROM admin_sessions WHERE id IN ('${oldSessionId}', '${controlSessionId}')`);
  psql(
    `DELETE FROM idempotency_keys WHERE id IN ('${expiredIdempotencyId}', '${controlIdempotencyId}')`
  );
}
