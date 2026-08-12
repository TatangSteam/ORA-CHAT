import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const compose = (args) => {
  const result = spawnSync('docker', ['compose', '--env-file', '.env.example', ...args], {
    encoding: 'utf8'
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `docker compose ${args.join(' ')} failed`);
  }

  return result.stdout.trim();
};

const violations = [];
const statusLines = compose(['ps', '-a', '--format', 'json'])
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const statusByService = new Map(statusLines.map((entry) => [entry.Service, entry]));

for (const service of ['api', 'minio', 'postgres', 'redis', 'web', 'whatsapp', 'worker']) {
  const status = statusByService.get(service);
  if (status?.State !== 'running' || status.Health !== 'healthy') {
    violations.push(`${service} must be running and healthy`);
  }
}

const minioInit = statusByService.get('minio-init');
if (minioInit?.State !== 'exited' || minioInit.ExitCode !== 0) {
  violations.push('minio-init must exit successfully');
}

const tenantId = compose([
  'exec',
  '-T',
  'postgres',
  'psql',
  '-U',
  'raho_app',
  '-d',
  'raho_chatbot',
  '-Atc',
  "SELECT id FROM tenants WHERE slug = 'default'"
]);
const ephemeralQr = compose([
  'exec',
  '-T',
  'api',
  'node',
  '-e',
  "const fs=require('node:fs');const token=fs.readFileSync(process.env.WHATSAPP_INTERNAL_TOKEN_FILE,'utf8').trim();fetch(process.env.WHATSAPP_INTERNAL_URL,{headers:{authorization:'Bearer '+token,'x-tenant-id':process.argv.at(-1)}}).then(async r=>{if(r.status===404)return;if(!r.ok)process.exit(2);const value=await r.json();process.stdout.write(value.qr)}).catch(()=>process.exit(3))",
  tenantId
]);
const logs = compose(['logs', '--no-color']);
for (const name of [
  'application_hash_key',
  'bootstrap_admin_password',
  'minio_root_password',
  'minio_root_user',
  'minio_api_access_key',
  'minio_api_parent_secret',
  'minio_api_secret_key',
  'minio_operator_access_key',
  'minio_operator_secret_key',
  'minio_worker_access_key',
  'minio_worker_parent_secret',
  'minio_worker_secret_key',
  'postgres_password',
  'redis_password',
  'whatsapp_internal_token'
]) {
  const value = readFileSync(`.secrets/${name}`, 'utf8').trim();
  if (value && logs.includes(value)) {
    violations.push(`${name} value was found in Compose logs`);
  }
}
if (ephemeralQr && logs.includes(ephemeralQr)) {
  violations.push('raw WhatsApp QR value was found in Compose logs');
}

const postgresVersions = compose([
  'exec',
  '-T',
  'postgres',
  'psql',
  '-U',
  'raho_app',
  '-d',
  'raho_chatbot',
  '-Atc',
  "SHOW server_version; SELECT default_version FROM pg_available_extensions WHERE name = 'vector';"
]).split('\n');
const redisVersion = compose(['exec', '-T', 'redis', 'redis-server', '--version']);
const minioVersion = compose(['exec', '-T', 'minio', 'minio', '--version']);
const nodeVersion = compose(['exec', '-T', 'api', 'node', '--version']);

if (postgresVersions[0] !== '18.4 (Debian 18.4-1.pgdg12+1)') {
  violations.push(`unexpected PostgreSQL version: ${postgresVersions[0]}`);
}
if (postgresVersions[1] !== '0.8.6') {
  violations.push(`unexpected pgvector version: ${postgresVersions[1]}`);
}
if (!redisVersion.includes('v=8.8.0')) {
  violations.push('Redis runtime is not 8.8.0');
}
if (!minioVersion.includes('RELEASE.2025-04-22T22-12-26Z')) {
  violations.push('MinIO runtime release does not match the approved baseline');
}
if (nodeVersion !== 'v24.18.0') {
  violations.push(`unexpected Node runtime: ${nodeVersion}`);
}

const [apiResponse, webResponse] = await Promise.all([
  globalThis.fetch('http://127.0.0.1:4000/health/live'),
  globalThis.fetch('http://127.0.0.1:3000')
]);
if (!apiResponse.ok || !webResponse.ok) {
  violations.push('loopback API or web endpoint is not reachable');
}

if (violations.length > 0) {
  process.stderr.write(`${violations.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(
  `${JSON.stringify(
    {
      minioInit: 'completed',
      qrLogScan: ephemeralQr ? 'passed' : 'not_available',
      secretLogScan: 'passed',
      servicesHealthy: 7,
      status: 'passed',
      versions: {
        minio: 'RELEASE.2025-04-22T22-12-26Z',
        node: '24.18.0',
        pgvector: '0.8.6',
        postgres: '18.4',
        redis: '8.8.0'
      }
    },
    null,
    2
  )}\n`
);
