import { afterEach, describe, expect, it } from 'vitest';

import { createWhatsAppHealthServer } from './health.js';
import { EphemeralQrStore } from './qr-store.js';

const activeServers: ReturnType<typeof createWhatsAppHealthServer>[] = [];

afterEach(async () => {
  await Promise.all(
    activeServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.closeAllConnections();
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
});

describe('WhatsApp health foundation', () => {
  it('serves a live response over TCP', async () => {
    const server = createWhatsAppHealthServer();
    activeServers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected a TCP server address');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/health/live`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ service: 'whatsapp', status: 'live' });
  });

  it('protects the internal send boundary and returns only provider id', async () => {
    const token = 't'.repeat(64);
    const server = createWhatsAppHealthServer(() => true, {
      token,
      store: new EphemeralQrStore(),
      send: async () => ({ providerMessageId: 'provider-123' })
    });
    activeServers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    const url = `http://127.0.0.1:${address.port}/internal/v1/send`;
    const body = JSON.stringify({
      tenantId: '01988c36-6880-7000-8000-000000000001',
      outboxMessageId: '01988c36-6880-7000-8000-000000000002',
      deliveryAttemptId: '01988c36-6880-7000-8000-000000000003',
      recipientJid: '6281234567890@s.whatsapp.net',
      content: 'Halo'
    });
    const denied = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body
    });
    expect(denied.status).toBe(401);
    const accepted = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body
    });
    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toEqual({ providerMessageId: 'provider-123' });
  });

  it('protects and dispatches internal session controls', async () => {
    const token = 's'.repeat(64);
    const tenantId = '01988c36-6880-7000-8000-000000000001';
    const actions: string[] = [];
    const server = createWhatsAppHealthServer(() => true, {
      token,
      store: new EphemeralQrStore(),
      reconnect: async (receivedTenantId) => {
        actions.push(`reconnect:${receivedTenantId}`);
      },
      disconnect: async (receivedTenantId) => {
        actions.push(`disconnect:${receivedTenantId}`);
      }
    });
    activeServers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    const base = `http://127.0.0.1:${address.port}/internal/v1/session`;

    const denied = await fetch(`${base}/disconnect`, { method: 'POST' });
    expect(denied.status).toBe(401);

    const headers = { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId };
    const reconnect = await fetch(`${base}/reconnect`, { method: 'POST', headers });
    const disconnect = await fetch(`${base}/disconnect`, { method: 'POST', headers });

    expect(reconnect.status).toBe(204);
    expect(disconnect.status).toBe(204);
    expect(actions).toEqual([`reconnect:${tenantId}`, `disconnect:${tenantId}`]);
  });

  it('protects and dispatches composing presence without exposing it publicly', async () => {
    const token = 'p'.repeat(64);
    const calls: string[] = [];
    const server = createWhatsAppHealthServer(() => true, {
      token,
      store: new EphemeralQrStore(),
      presence: async (tenantId, recipientJid, state) => {
        calls.push(`${tenantId}:${recipientJid}:${state}`);
      }
    });
    activeServers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    const url = `http://127.0.0.1:${address.port}/internal/v1/presence`;
    const body = JSON.stringify({
      tenantId: '01988c36-6880-7000-8000-000000000001',
      recipientJid: '6281234567890@s.whatsapp.net',
      state: 'composing'
    });

    expect(
      await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    ).toMatchObject({ status: 401 });
    expect(
      await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body
      })
    ).toMatchObject({ status: 204 });
    expect(calls).toEqual([
      '01988c36-6880-7000-8000-000000000001:6281234567890@s.whatsapp.net:composing'
    ]);
  });
});
