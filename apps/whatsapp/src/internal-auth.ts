import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const readWhatsAppInternalToken = (): string => {
  const path = process.env.WHATSAPP_INTERNAL_TOKEN_FILE;
  if (!path) throw new Error('WHATSAPP_INTERNAL_TOKEN_FILE is required');
  const token = readFileSync(path, 'utf8').trim();
  if (token.length < 48) throw new Error('WhatsApp internal token is too short');
  return token;
};

export const verifyInternalToken = (
  expected: string,
  authorization: string | undefined
): boolean => {
  if (!authorization?.startsWith('Bearer ')) return false;
  const received = Buffer.from(authorization.slice(7));
  const reference = Buffer.from(expected);
  return received.length === reference.length && timingSafeEqual(received, reference);
};
