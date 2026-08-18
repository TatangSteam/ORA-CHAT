import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const composePath = 'compose.yaml';
const composeSource = readFileSync(composePath, 'utf8');
const dockerfileSource = readFileSync('infra/Dockerfile.app', 'utf8');
const minioDockerfileSource = readFileSync('infra/Dockerfile.minio', 'utf8');
const postgresDockerfileSource = readFileSync('infra/Dockerfile.postgres', 'utf8');
const redisConfigSource = readFileSync('infra/redis/redis.conf', 'utf8');
const composeResult = spawnSync(
  'docker',
  ['compose', '--env-file', '.env.example', '-f', composePath, 'config', '--format', 'json'],
  {
    encoding: 'utf8'
  }
);

if (composeResult.error) {
  process.stderr.write(`Unable to execute Docker Compose: ${composeResult.error.message}\n`);
  process.exit(1);
}

if (composeResult.status !== 0) {
  process.stderr.write(composeResult.stderr);
  process.exit(composeResult.status ?? 1);
}

const config = JSON.parse(composeResult.stdout);
const violations = [];
const requiredServices = [
  'api',
  'minio',
  'minio-init',
  'postgres',
  'redis',
  'web',
  'whatsapp',
  'worker'
];
const longRunningServices = requiredServices.filter((name) => name !== 'minio-init');
const expectedImages = {
  minio: 'raho/minio-full:2025-04-22-r1',
  'minio-init': 'raho/minio-full:2025-04-22-r1',
  postgres: 'raho/postgres-pgvector:18.4-0.8.6-r1',
  redis:
    'redis:8.8.0-alpine3.23@sha256:9d317178eceac8454a2284a9e6df2466b93c745529947f0cd42a0fa9609d7005'
};

const serviceNames = Object.keys(config.services ?? {}).sort();

if (JSON.stringify(serviceNames) !== JSON.stringify(requiredServices)) {
  violations.push(`services must be exactly ${requiredServices.join(', ')}`);
}

if ('bullmq' in (config.services ?? {})) {
  violations.push('BullMQ must be an application dependency, not a Compose service');
}

for (const [name, image] of Object.entries(expectedImages)) {
  if (config.services?.[name]?.image !== image) {
    violations.push(`${name} image must be pinned to ${image}`);
  }
}

for (const name of ['api', 'web', 'whatsapp', 'worker']) {
  const service = config.services?.[name];
  if (service?.image !== 'raho/whatsapp-chatbot-v2-app:0.0.0') {
    violations.push(`${name} must use the exact local application image tag`);
  }
}

if (!config.services?.api?.build || config.services.api.pull_policy !== 'never') {
  violations.push('api must build the shared application image locally');
}

if (!config.services?.minio?.build || config.services.minio.pull_policy !== 'never') {
  violations.push('minio must build the exact internal full-console image locally');
}

if (!config.services?.postgres?.build || config.services.postgres.pull_policy !== 'never') {
  violations.push('postgres must build the hardened pgvector image locally');
}

if (
  config.services?.['minio-init']?.build ||
  config.services?.['minio-init']?.pull_policy !== 'never'
) {
  violations.push('minio-init must reuse the locally built MinIO image');
}

for (const name of ['web', 'whatsapp', 'worker']) {
  const service = config.services?.[name];
  if (service?.build || service?.pull_policy !== 'never') {
    violations.push(`${name} must reuse the locally built application image`);
  }
}

for (const name of longRunningServices) {
  if (!config.services?.[name]?.healthcheck?.test) {
    violations.push(`${name} must define a healthcheck`);
  }
}

if (config.networks?.data?.internal !== true) {
  violations.push('data network must be internal');
}

for (const name of ['minio_data', 'postgres_data', 'redis_data', 'whatsapp_auth']) {
  if (!(name in (config.volumes ?? {}))) {
    violations.push(`named volume ${name} is required`);
  }
}

for (const name of ['api', 'minio', 'minio-init', 'postgres', 'redis', 'whatsapp', 'worker']) {
  if (!('data' in (config.services?.[name]?.networks ?? {}))) {
    violations.push(`${name} must join the internal data network`);
  }
}

if (!('app' in (config.services?.web?.networks ?? {}))) {
  violations.push('web must join the application network');
}

for (const name of [
  'ai_master_key',
  'application_hash_key',
  'bootstrap_admin_password',
  'minio_api_access_key',
  'minio_api_parent_secret',
  'minio_api_secret_key',
  'minio_operator_access_key',
  'minio_operator_secret_key',
  'minio_root_password',
  'minio_root_user',
  'minio_worker_access_key',
  'minio_worker_parent_secret',
  'minio_worker_secret_key',
  'postgres_password',
  'redis_password',
  'whatsapp_internal_token'
]) {
  if (!(name in (config.secrets ?? {}))) {
    violations.push(`file-based secret ${name} is required`);
  }
}

if (
  config.services?.api?.environment?.AI_MASTER_KEY_FILE !== '/run/secrets/ai_master_key' ||
  !config.services?.api?.secrets?.some?.((secret) => secret.source === 'ai_master_key')
) {
  violations.push('api must receive AI master key only through the file-secret boundary');
}

if (
  config.services?.api?.environment?.AI_PRIVATE_HOST_ALLOWLIST !== 'openclaw' ||
  config.services?.api?.environment?.AI_PRIVATE_PORT_ALLOWLIST !== '18789'
) {
  violations.push('private AI egress must be restricted to the named OpenClaw gateway and port');
}

for (const name of ['postgres', 'redis']) {
  if ((config.services?.[name]?.ports ?? []).length > 0) {
    violations.push(`${name} must not publish a host port`);
  }
}

for (const name of ['api', 'minio', 'web']) {
  for (const port of config.services?.[name]?.ports ?? []) {
    if (port.host_ip !== '127.0.0.1') {
      violations.push(`${name} published ports must bind to 127.0.0.1`);
    }
  }
}

const initDependency = config.services?.['minio-init']?.depends_on?.minio;
if (initDependency?.condition !== 'service_healthy') {
  violations.push('minio-init must wait for healthy MinIO');
}

for (const name of ['api', 'whatsapp', 'worker']) {
  const dependency = config.services?.[name]?.depends_on?.['minio-init'];
  if (dependency?.condition !== 'service_completed_successfully') {
    violations.push(`${name} must wait for successful minio-init`);
  }
}

if (/^\s*version\s*:/mu.test(composeSource)) {
  violations.push('Compose must use the modern specification without a version field');
}

if (/\bcontainer_name\s*:/u.test(composeSource)) {
  violations.push('container_name is forbidden because it prevents project isolation');
}

if (/(?:image|from):[^\n]*(?::latest|:main\b)/iu.test(composeSource)) {
  violations.push('floating image reference detected');
}

if (
  /\b(?:POSTGRES_PASSWORD|REDIS_PASSWORD|MINIO_ROOT_PASSWORD)\s*:\s*[^\s$]/u.test(composeSource)
) {
  violations.push('plaintext secret-like environment value detected in Compose');
}

const expectedMinioBase =
  'quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z@sha256:a1ea29fa28355559ef137d71fc570e508a214ec84ff8083e39bc5428980b015e';
if (!minioDockerfileSource.includes(`FROM ${expectedMinioBase}`)) {
  violations.push(`internal MinIO image must derive from ${expectedMinioBase}`);
}
if (!/^USER 1000:1000$/mu.test(minioDockerfileSource)) {
  violations.push('internal MinIO image must run as UID/GID 1000');
}

const expectedGoBuildImage =
  'golang:1.25.11-trixie@sha256:56a4d6ead4365cd569ca388003bdce672e7ca7286513f96b44b03d3b5e79d26f';
const expectedNodeBuildImage =
  'node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d';
const expectedNodeRuntimeImage =
  'node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d';
const nodeFromStatements = [...dockerfileSource.matchAll(/^FROM\s+(\S+)/gimu)].map(
  (match) => match[1]
);
if (
  nodeFromStatements.length !== 3 ||
  nodeFromStatements[0] !== expectedGoBuildImage ||
  nodeFromStatements[1] !== expectedNodeBuildImage ||
  nodeFromStatements[2] !== expectedNodeRuntimeImage
) {
  violations.push(
    `application stages must use ${expectedGoBuildImage}, ${expectedNodeBuildImage}, then ${expectedNodeRuntimeImage}`
  );
}
if (/esbuild\+linux-(?:arm64|x64)/u.test(dockerfileSource)) {
  violations.push('application image hardening must not pin esbuild to one CPU architecture');
}

const expectedPostgresBase =
  'pgvector/pgvector:0.8.6-pg18-bookworm@sha256:691673308c99d2161ba298736f3147f1f22d79de2fb7ec93ae9b4afcab870b62';
if (!postgresDockerfileSource.includes(`FROM ${expectedPostgresBase} AS patched`)) {
  violations.push(`hardened PostgreSQL image must derive from ${expectedPostgresBase}`);
}
if (!/^FROM scratch$/mu.test(postgresDockerfileSource)) {
  violations.push('hardened PostgreSQL image must flatten the patched runtime filesystem');
}

for (const directive of ['appendonly yes', 'appendfsync everysec', 'maxmemory-policy noeviction']) {
  if (!redisConfigSource.includes(directive)) {
    violations.push(`Redis config must include ${directive}`);
  }
}

if (violations.length > 0) {
  process.stderr.write(`${violations.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(
  `${JSON.stringify(
    {
      images: Object.keys(expectedImages).length,
      internalNetwork: 'data',
      services: serviceNames.length,
      status: 'passed',
      volumes: 4
    },
    null,
    2
  )}\n`
);
