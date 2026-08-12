import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const localSecretNames = [
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
];

export const localSecretLengths = Object.fromEntries(
  localSecretNames.map((name) => [
    name,
    name.endsWith('_access_key') ? 20 : name.endsWith('_secret_key') ? 40 : 64
  ])
);

const validateExistingSecret = (path, length) => {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${path} must be a regular file`);
  }

  const value = readFileSync(path, 'utf8');
  const expected = new RegExp(`^[0-9a-f]{${length}}\\n?$`, 'u');
  if (!expected.test(value)) {
    throw new Error(`${path} must contain one ${length}-character hexadecimal secret`);
  }

  chmodSync(path, 0o600);
};

export const initializeLocalSecrets = (directory = resolve('.secrets')) => {
  mkdirSync(directory, { mode: 0o700, recursive: true });
  const directoryStat = lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error(`${directory} must be a real directory`);
  }
  chmodSync(directory, 0o700);

  const results = [];

  for (const name of localSecretNames) {
    const path = resolve(directory, name);
    const length = localSecretLengths[name];
    let descriptor;

    try {
      descriptor = openSync(path, 'wx', 0o600);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
        validateExistingSecret(path, length);
        results.push({ name, status: 'existing' });
        continue;
      }
      throw error;
    }

    try {
      writeFileSync(descriptor, `${randomBytes(length / 2).toString('hex')}\n`, {
        encoding: 'utf8'
      });
    } finally {
      closeSync(descriptor);
    }

    results.push({ name, status: 'created' });
  }

  return results;
};

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;

if (entryPath === import.meta.url) {
  const results = initializeLocalSecrets();
  process.stdout.write(`${JSON.stringify({ directory: '.secrets', results }, null, 2)}\n`);
}
