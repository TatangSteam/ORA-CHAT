import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { hashOpaqueValue, newOpaqueToken } from '@raho/db';

export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_COOKIE_PRODUCTION = '__Host-raho_session';
export const SESSION_COOKIE_DEVELOPMENT = 'raho_session';
export const LOGIN_CSRF_COOKIE = 'raho_login_csrf';

export const readApplicationHashKey = (): Buffer => {
  const path = process.env.APPLICATION_HASH_KEY_FILE;
  if (!path) throw new Error('APPLICATION_HASH_KEY_FILE is required');
  const value = readFileSync(path, 'utf8').trim();
  if (!/^[0-9a-f]{64}$/u.test(value)) throw new Error('Application hash key is invalid');
  return Buffer.from(value, 'hex');
};

export const keyedHash = (key: Buffer, value: string): string =>
  createHmac('sha256', key).update(value, 'utf8').digest('hex');

export const cookieName = (production: boolean): string =>
  production ? SESSION_COOKIE_PRODUCTION : SESSION_COOKIE_DEVELOPMENT;

export const serializeCookie = (
  name: string,
  value: string,
  options: { production: boolean; maxAgeSeconds?: number; sameSite?: 'Lax' | 'Strict' }
): string => {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${options.sameSite ?? 'Lax'}`
  ];
  if (options.production) parts.push('Secure');
  if (options.maxAgeSeconds !== undefined) parts.push(`Max-Age=${options.maxAgeSeconds}`);
  return parts.join('; ');
};

export const parseCookies = (header: string | undefined): ReadonlyMap<string, string> => {
  const parsed = new Map<string, string>();
  for (const item of header?.split(';') ?? []) {
    const separator = item.indexOf('=');
    if (separator < 1) continue;
    try {
      parsed.set(
        item.slice(0, separator).trim(),
        decodeURIComponent(item.slice(separator + 1).trim())
      );
    } catch {
      // Ignore malformed cookie input.
    }
  }
  return parsed;
};

export const issueLoginCsrf = (key: Buffer): { token: string; cookie: string } => {
  const token = newOpaqueToken();
  return { token, cookie: keyedHash(key, `login-csrf:${token}`) };
};

export const verifyLoginCsrf = (key: Buffer, token: string, cookie: string): boolean => {
  const expected = Buffer.from(keyedHash(key, `login-csrf:${token}`), 'hex');
  const actual = Buffer.from(cookie, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export { hashOpaqueValue, newOpaqueToken };
