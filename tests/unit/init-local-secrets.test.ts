import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  initializeLocalSecrets,
  localSecretLengths,
  localSecretNames
} from '../../scripts/init-local-secrets.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('local secret initializer', () => {
  it('creates strong file secrets once without printing or rotating their values', () => {
    const parent = mkdtempSync(join(tmpdir(), 'raho-secret-test-'));
    temporaryDirectories.push(parent);
    const directory = join(parent, '.secrets');

    const firstRun = initializeLocalSecrets(directory);
    const firstValues = Object.fromEntries(
      localSecretNames.map((name) => [name, readFileSync(join(directory, name), 'utf8')])
    );
    const secondRun = initializeLocalSecrets(directory);
    const secondValues = Object.fromEntries(
      localSecretNames.map((name) => [name, readFileSync(join(directory, name), 'utf8')])
    );

    expect(firstRun.every(({ status }) => status === 'created')).toBe(true);
    expect(secondRun.every(({ status }) => status === 'existing')).toBe(true);
    expect(secondValues).toEqual(firstValues);
    expect(statSync(directory).mode & 0o777).toBe(0o700);

    for (const [name, value] of Object.entries(firstValues)) {
      expect(value).toMatch(new RegExp(`^[0-9a-f]{${localSecretLengths[name]}}\\n$`, 'u'));
      expect(statSync(join(directory, name)).mode & 0o777).toBe(0o600);
    }
  });

  it('rejects an invalid existing secret without replacing it', () => {
    const parent = mkdtempSync(join(tmpdir(), 'raho-secret-test-'));
    temporaryDirectories.push(parent);
    const directory = join(parent, '.secrets');
    const path = join(directory, 'minio_root_password');
    mkdirSync(directory);
    writeFileSync(path, 'weak-value\n', { encoding: 'utf8', mode: 0o600 });

    expect(() => initializeLocalSecrets(directory)).toThrow(
      'must contain one 64-character hexadecimal secret'
    );
    expect(readFileSync(path, 'utf8')).toBe('weak-value\n');
  });
});
