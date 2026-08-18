import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';

import { internalQrResponseSchema } from '@raho/contracts';

export interface QrProvider {
  get(tenantId: string): Promise<{ qr: string; expiresAt: Date } | null>;
}

export interface WhatsAppSessionController {
  reconnect(tenantId: string): Promise<void>;
  disconnect(tenantId: string): Promise<void>;
  presence?(tenantId: string, recipientJid: string, state: 'composing' | 'paused'): Promise<void>;
}

export const readInternalToken = (): string => {
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

export class InternalWhatsAppQrProvider implements QrProvider, WhatsAppSessionController {
  private readonly token = readInternalToken();

  public constructor(
    private readonly endpoint = process.env.WHATSAPP_INTERNAL_URL ??
      'http://whatsapp:4020/internal/v1/qr',
    private readonly sessionEndpoint = process.env.WHATSAPP_SESSION_INTERNAL_URL ??
      'http://whatsapp:4020/internal/v1/session',
    private readonly presenceEndpoint = process.env.WHATSAPP_PRESENCE_INTERNAL_URL ??
      'http://whatsapp:4020/internal/v1/presence'
  ) {}

  public async get(tenantId: string): Promise<{ qr: string; expiresAt: Date } | null> {
    const response = await fetch(this.endpoint, {
      headers: { authorization: `Bearer ${this.token}`, 'x-tenant-id': tenantId },
      cache: 'no-store',
      signal: AbortSignal.timeout(2_000)
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('WhatsApp QR service is unavailable');
    const payload = internalQrResponseSchema.parse(await response.json());
    return { qr: payload.qr, expiresAt: new Date(payload.expiresAt) };
  }

  public reconnect(tenantId: string): Promise<void> {
    return this.control('reconnect', tenantId);
  }

  public disconnect(tenantId: string): Promise<void> {
    return this.control('disconnect', tenantId);
  }

  public async presence(
    tenantId: string,
    recipientJid: string,
    state: 'composing' | 'paused'
  ): Promise<void> {
    const response = await fetch(this.presenceEndpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ tenantId, recipientJid, state }),
      cache: 'no-store',
      signal: AbortSignal.timeout(2_000)
    });
    if (!response.ok) throw new Error('WhatsApp presence service is unavailable');
  }

  private async control(action: 'reconnect' | 'disconnect', tenantId: string): Promise<void> {
    const response = await fetch(`${this.sessionEndpoint}/${action}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'x-tenant-id': tenantId },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(`WhatsApp ${action} control is unavailable`);
  }
}
