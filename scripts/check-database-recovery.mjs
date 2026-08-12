import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const compose = (args, allowFailure = false) => {
  const result = spawnSync('docker', ['compose', '--env-file', '.env.example', ...args], {
    encoding: 'utf8'
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(result.stderr || `docker compose ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
};

const suffix = randomBytes(6).toString('hex');
const database = `raho_recovery_${suffix}`;
const dump = `/tmp/${database}.dump`;
const execPostgres = (...args) => compose(['exec', '-T', 'postgres', ...args]);
const countsQuery = `
  SELECT json_build_object(
    'tenants', (SELECT count(*) FROM tenants),
    'users', (SELECT count(*) FROM admin_users),
    'audits', (SELECT count(*) FROM audit_logs),
    'migrations', (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL),
    'auditTrigger', (SELECT count(*) FROM pg_trigger WHERE tgname = 'audit_logs_append_only')
  )::text
`;
const query = (target) =>
  execPostgres(
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'raho_app',
    '-d',
    target,
    '-Atc',
    countsQuery
  );

try {
  execPostgres(
    'pg_dump',
    '-U',
    'raho_app',
    '-d',
    'raho_chatbot',
    '--format=custom',
    '--file',
    dump
  );
  execPostgres('createdb', '-U', 'raho_app', database);
  execPostgres('pg_restore', '-U', 'raho_app', '-d', database, '--exit-on-error', dump);

  const source = JSON.parse(query('raho_chatbot'));
  const restored = JSON.parse(query(database));
  if (JSON.stringify(restored) !== JSON.stringify(source)) {
    throw new Error('Recovered database evidence does not match the source database');
  }
  process.stdout.write(
    `${JSON.stringify({ auditTrigger: restored.auditTrigger, migrations: restored.migrations, scopedRestore: true, status: 'passed' })}\n`
  );
} finally {
  execPostgres('dropdb', '-U', 'raho_app', '--if-exists', '--force', database);
  compose(['exec', '-T', 'postgres', 'rm', '-f', dump], true);
}
