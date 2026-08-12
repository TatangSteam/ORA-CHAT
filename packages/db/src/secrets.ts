import { createHash, randomBytes } from 'node:crypto';

export const newOpaqueToken = (): string => randomBytes(32).toString('base64url');

export const hashOpaqueValue = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');
