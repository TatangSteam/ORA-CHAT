import { createServer, type Server } from 'node:http';

import { hashOpaqueValue, hashPassword } from '@raho/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApp } from './app.js';
import type { AiConnectionView, AiRepository } from './ai-repository.js';
import { TenantEventHub } from './event-hub.js';
import type {
  ApiRepository,
  AuditInput,
  AuditPage,
  LoginIdentity,
  NewSession,
  SafetyState,
  SessionIdentity,
  WhatsAppState
} from './repository.js';

const now = new Date('2026-08-07T05:00:00.000Z');
let passwordHash = '';

beforeAll(async () => {
  passwordHash = await hashPassword('correct horse battery staple');
});

class MemoryRepository implements ApiRepository {
  public readonly sessions = new Map<string, SessionIdentity>();
  private sessionSequence = 4;
  public loginFailures = 0;
  public auditTenantId: string | null = null;
  public safetyTenantId: string | null = null;
  public whatsAppTenantId: string | null = null;
  public safetyUpdates = 0;
  public identity: LoginIdentity = {
    userId: '01988c36-6880-7000-8000-000000000001',
    username: 'admin',
    displayName: 'Admin Test',
    passwordHash,
    passwordChangedAt: new Date('2026-08-06T00:00:00.000Z'),
    userStatus: 'active',
    membershipId: '01988c36-6880-7000-8000-000000000002',
    role: 'super_admin',
    permissionOverrides: { grant: [], deny: [] },
    tenantId: '01988c36-6880-7000-8000-000000000003',
    tenantSlug: 'tenant-a',
    tenantName: 'Tenant A',
    tenantStatus: 'active'
  };

  public async ping() {}
  public async findLoginIdentity(tenantSlug: string, username: string) {
    return tenantSlug === this.identity.tenantSlug && username === this.identity.username
      ? this.identity
      : null;
  }
  public async recordLoginFailure() {
    this.loginFailures += 1;
  }
  public async createSession(input: NewSession) {
    const sessionId = `01988c36-6880-7000-8000-${String(this.sessionSequence).padStart(12, '0')}`;
    this.sessionSequence += 1;
    this.sessions.set(input.tokenHash, {
      ...input.identity,
      sessionId,
      sessionCreatedAt: now,
      expiresAt: input.expiresAt,
      idleExpiresAt: input.idleExpiresAt,
      revokedAt: null,
      csrfSecretHash: input.csrfSecretHash
    });
    return { sessionId };
  }
  public async findSession(tokenHash: string) {
    return this.sessions.get(tokenHash) ?? null;
  }
  public async rotateCsrf(sessionId: string, csrfSecretHash: string) {
    for (const [key, session] of this.sessions) {
      if (session.sessionId === sessionId) this.sessions.set(key, { ...session, csrfSecretHash });
    }
  }
  public async touchSession() {}
  public async revokeSession(sessionId: string) {
    for (const [key, session] of this.sessions) {
      if (session.sessionId === sessionId) this.sessions.set(key, { ...session, revokedAt: now });
    }
  }
  public async changePassword(
    session: SessionIdentity,
    nextPasswordHash: string,
    _requestId: string,
    changedAt: Date
  ) {
    this.identity = {
      ...this.identity,
      passwordHash: nextPasswordHash,
      passwordChangedAt: changedAt
    };
    for (const [key, existing] of this.sessions) {
      if (existing.userId === session.userId) {
        this.sessions.set(key, {
          ...existing,
          passwordHash: nextPasswordHash,
          passwordChangedAt: changedAt,
          revokedAt: changedAt
        });
      }
    }
  }
  public async appendAudit(input: AuditInput) {
    void input;
  }
  public async listAudit(tenantId: string): Promise<AuditPage> {
    this.auditTenantId = tenantId;
    return { items: [], nextCursor: null };
  }
  public async getSafetyState(tenantId: string): Promise<SafetyState> {
    this.safetyTenantId = tenantId;
    return {
      sendingPaused: false,
      killSwitch: false,
      riskLevel: 'low',
      reason: null,
      revision: 0,
      updatedAt: now
    };
  }
  public async updateSafetyState(input: { tenantId: string }): Promise<SafetyState | null> {
    this.safetyUpdates += 1;
    return this.getSafetyState(input.tenantId);
  }
  public async getWhatsAppState(tenantId: string): Promise<WhatsAppState> {
    this.whatsAppTenantId = tenantId;
    return {
      adapter: 'baileys',
      state: 'logged_out',
      connectedAt: null,
      lastHeartbeatAt: null,
      lastErrorCode: null,
      revision: 0,
      updatedAt: now
    };
  }
  public async updateWhatsAppState(input: { tenantId: string }): Promise<WhatsAppState | null> {
    return this.getWhatsAppState(input.tenantId);
  }
}

const servers: Server[] = [];
afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.closeAllConnections();
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
});

const start = async (
  repository: MemoryRepository,
  overrides: Pick<
    NonNullable<Parameters<typeof createApp>[0]>,
    'aiRepository' | 'eventHub' | 'qrProvider' | 'whatsappSessionController'
  > = {}
) => {
  const server = createServer(
    createApp({
      repository,
      hashKey: Buffer.alloc(32, 7),
      production: true,
      now: () => now,
      sleep: async () => {},
      ...overrides
    })
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('TCP address expected');
  return `http://127.0.0.1:${address.port}`;
};

const cookieValue = (setCookie: string, name: string): string => {
  const match = setCookie.match(new RegExp(`${name}=([^;]+)`, 'u'));
  if (!match?.[1]) throw new Error(`Cookie ${name} not found`);
  return `${name}=${match[1]}`;
};

describe('admin authentication security contract', () => {
  it('requires login CSRF, returns an opaque secure cookie, and enforces logout CSRF', async () => {
    const repository = new MemoryRepository();
    const origin = await start(repository);
    const csrfResponse = await fetch(`${origin}/api/admin/v1/auth/csrf`);
    const loginCsrfCookie = cookieValue(
      csrfResponse.headers.getSetCookie().join(';'),
      'raho_login_csrf'
    );
    const csrfBody = (await csrfResponse.json()) as { data: { csrfToken: string } };

    const missingCsrf = await fetch(`${origin}/api/admin/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantSlug: 'tenant-a',
        username: 'admin',
        password: 'wrong password'
      })
    });
    expect(missingCsrf.status).toBe(403);

    const login = await fetch(`${origin}/api/admin/v1/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${loginCsrfCookie}; __Host-raho_session=attacker-fixed-value`,
        'x-csrf-token': csrfBody.data.csrfToken
      },
      body: JSON.stringify({
        tenantSlug: 'tenant-a',
        username: 'admin',
        password: 'correct horse battery staple'
      })
    });
    expect(login.status).toBe(201);
    const sessionHeader = login.headers
      .getSetCookie()
      .find((value) => value.startsWith('__Host-raho_session='));
    expect(sessionHeader).toContain('HttpOnly');
    expect(sessionHeader).toContain('Secure');
    expect(sessionHeader).toContain('SameSite=Lax');
    const loginBodyText = await login.text();
    const sessionCookie = cookieValue(sessionHeader!, '__Host-raho_session');
    const rawToken = decodeURIComponent(sessionCookie.split('=')[1]!);
    expect(rawToken).not.toBe('attacker-fixed-value');
    expect(loginBodyText).not.toContain(rawToken);
    expect(repository.sessions.has(hashOpaqueValue(rawToken))).toBe(true);

    const me = await fetch(`${origin}/api/admin/v1/me`, { headers: { cookie: sessionCookie } });
    const meBody = (await me.json()) as { data: { csrfToken: string; tenant: { id: string } } };
    expect(meBody.data.tenant.id).toBe(repository.identity.tenantId);

    const noCsrfLogout = await fetch(`${origin}/api/admin/v1/auth/logout`, {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: '{}'
    });
    expect(noCsrfLogout.status).toBe(403);

    const logout = await fetch(`${origin}/api/admin/v1/auth/logout`, {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
        'x-csrf-token': meBody.data.csrfToken
      },
      body: '{}'
    });
    expect(logout.status).toBe(200);
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('expires idle sessions and clears the unusable cookie', async () => {
    const repository = new MemoryRepository();
    const origin = await start(repository);
    const csrfResponse = await fetch(`${origin}/api/admin/v1/auth/csrf`);
    const loginCsrfCookie = cookieValue(
      csrfResponse.headers.getSetCookie().join(';'),
      'raho_login_csrf'
    );
    const csrfBody = (await csrfResponse.json()) as { data: { csrfToken: string } };
    const login = await fetch(`${origin}/api/admin/v1/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: loginCsrfCookie,
        'x-csrf-token': csrfBody.data.csrfToken
      },
      body: JSON.stringify({
        tenantSlug: 'tenant-a',
        username: 'admin',
        password: 'correct horse battery staple'
      })
    });
    const sessionHeader = login.headers
      .getSetCookie()
      .find((value) => value.startsWith('__Host-raho_session='));
    const sessionCookie = cookieValue(sessionHeader!, '__Host-raho_session');
    const rawToken = decodeURIComponent(sessionCookie.split('=')[1]!);
    const stored = repository.sessions.get(hashOpaqueValue(rawToken))!;
    repository.sessions.set(hashOpaqueValue(rawToken), {
      ...stored,
      idleExpiresAt: new Date(now.getTime() - 1)
    });

    const response = await fetch(`${origin}/api/admin/v1/me`, {
      headers: { cookie: sessionCookie }
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('revokes every existing session after a password change', async () => {
    const repository = new MemoryRepository();
    const origin = await start(repository);
    const login = async (password: string) => {
      const csrfResponse = await fetch(`${origin}/api/admin/v1/auth/csrf`);
      const loginCsrfCookie = cookieValue(
        csrfResponse.headers.getSetCookie().join(';'),
        'raho_login_csrf'
      );
      const csrfBody = (await csrfResponse.json()) as { data: { csrfToken: string } };
      return fetch(`${origin}/api/admin/v1/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: loginCsrfCookie,
          'x-csrf-token': csrfBody.data.csrfToken
        },
        body: JSON.stringify({ tenantSlug: 'tenant-a', username: 'admin', password })
      });
    };

    const first = await login('correct horse battery staple');
    const second = await login('correct horse battery staple');
    const firstCookie = cookieValue(
      first.headers.getSetCookie().find((value) => value.startsWith('__Host-raho_session='))!,
      '__Host-raho_session'
    );
    const secondCookie = cookieValue(
      second.headers.getSetCookie().find((value) => value.startsWith('__Host-raho_session='))!,
      '__Host-raho_session'
    );
    const me = await fetch(`${origin}/api/admin/v1/me`, { headers: { cookie: firstCookie } });
    const meBody = (await me.json()) as { data: { csrfToken: string } };

    const changed = await fetch(`${origin}/api/admin/v1/auth/password`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: firstCookie,
        'x-csrf-token': meBody.data.csrfToken
      },
      body: JSON.stringify({
        currentPassword: 'correct horse battery staple',
        newPassword: 'new correct horse battery staple'
      })
    });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('set-cookie')).toContain('Max-Age=0');

    expect(
      (await fetch(`${origin}/api/admin/v1/me`, { headers: { cookie: secondCookie } })).status
    ).toBe(401);
    expect((await login('correct horse battery staple')).status).toBe(401);
    expect((await login('new correct horse battery staple')).status).toBe(201);
  });

  it('uses generic invalid credentials and limits repeated failures', async () => {
    const repository = new MemoryRepository();
    const origin = await start(repository);
    const csrfResponse = await fetch(`${origin}/api/admin/v1/auth/csrf`);
    const loginCsrfCookie = cookieValue(
      csrfResponse.headers.getSetCookie().join(';'),
      'raho_login_csrf'
    );
    const csrfBody = (await csrfResponse.json()) as { data: { csrfToken: string } };
    const statuses: number[] = [];
    const messages = new Set<string>();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await fetch(`${origin}/api/admin/v1/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: loginCsrfCookie,
          'x-csrf-token': csrfBody.data.csrfToken
        },
        body: JSON.stringify({
          tenantSlug: 'tenant-a',
          username: 'admin',
          password: 'wrong password'
        })
      });
      statuses.push(response.status);
      const body = (await response.json()) as { error: { message: string } };
      messages.add(body.error.message);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    expect(messages.has('Kredensial tidak valid.')).toBe(true);
    expect(repository.loginFailures).toBe(5);
  }, 30_000);

  it('rejects tenant injection and always passes the session tenant to repositories', async () => {
    const repository = new MemoryRepository();
    const origin = await start(repository);
    const csrfResponse = await fetch(`${origin}/api/admin/v1/auth/csrf`);
    const loginCsrfCookie = cookieValue(
      csrfResponse.headers.getSetCookie().join(';'),
      'raho_login_csrf'
    );
    const csrfBody = (await csrfResponse.json()) as { data: { csrfToken: string } };
    const login = await fetch(`${origin}/api/admin/v1/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: loginCsrfCookie,
        'x-csrf-token': csrfBody.data.csrfToken
      },
      body: JSON.stringify({
        tenantSlug: 'tenant-a',
        username: 'admin',
        password: 'correct horse battery staple'
      })
    });
    const sessionHeader = login.headers
      .getSetCookie()
      .find((value) => value.startsWith('__Host-raho_session='));
    const sessionCookie = cookieValue(sessionHeader!, '__Host-raho_session');
    const loginBody = (await login.json()) as { data: { csrfToken: string } };
    const response = await fetch(`${origin}/api/admin/v1/audit?tenantId=tenant-b`, {
      headers: { cookie: sessionCookie }
    });
    expect(response.status).toBe(400);
    expect(repository.auditTenantId).toBeNull();

    const session = await fetch(`${origin}/api/admin/v1/session?tenantId=tenant-b`, {
      headers: { cookie: sessionCookie }
    });
    expect(session.status).toBe(200);
    expect(repository.whatsAppTenantId).toBe(repository.identity.tenantId);
    const injectedMutation = await fetch(`${origin}/api/admin/v1/safety/pause`, {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
        'x-csrf-token': loginBody.data.csrfToken
      },
      body: JSON.stringify({
        tenantId: '01988c36-6880-7000-8000-000000000099',
        reason: 'uji tenant injection',
        expectedRevision: 0
      })
    });
    expect(injectedMutation.status).toBe(400);
    expect(repository.safetyUpdates).toBe(0);
  });

  it('enforces AI RBAC, CSRF, tenant-derived IDOR protection, and write-only secrets', async () => {
    const repository = new MemoryRepository();
    const safeConnection: AiConnectionView = {
      id: '01988c36-6880-7000-8000-000000000050',
      name: 'Mock chat',
      purpose: 'chat',
      provider: 'mock',
      transport: 'native',
      baseUrl: null,
      modelId: 'mock-safe',
      dimensions: null,
      taskType: null,
      timeoutMs: 15_000,
      maxRetries: 0,
      maxOutputTokens: 512,
      generationConfig: {},
      capabilities: null,
      healthState: 'not_tested',
      lastTestErrorCode: null,
      lastTestedAt: null,
      testedRevision: null,
      revision: 0,
      credentialConfigured: true,
      credentialRotatedAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    const listConnections = vi.fn(async (tenantId: string) => {
      void tenantId;
      return [safeConnection];
    });
    const createConnection = vi.fn(async () => safeConnection);
    const listModels = vi.fn(async () => ({ status: 'not_found' as const }));
    const aiRepository = {
      getIntegration: vi.fn(async () => ({
        id: safeConnection.id,
        name: 'default',
        activeChatConnectionId: null,
        activeEmbeddingConnectionId: null,
        activeEmbeddingIndexVersionId: null,
        generationEnabled: false,
        retrievalEnabled: false,
        strictGrounding: true,
        status: 'inactive',
        revision: 0,
        updatedAt: now.toISOString()
      })),
      listConnections,
      createConnection,
      updateConnection: vi.fn(),
      replaceCredential: vi.fn(),
      deleteCredential: vi.fn(),
      testConnection: vi.fn(),
      listModels,
      activate: vi.fn(),
      deactivate: vi.fn()
    } as AiRepository;
    const origin = await start(repository, { aiRepository });
    const csrfResponse = await fetch(`${origin}/api/admin/v1/auth/csrf`);
    const loginCsrfCookie = cookieValue(
      csrfResponse.headers.getSetCookie().join(';'),
      'raho_login_csrf'
    );
    const csrfBody = (await csrfResponse.json()) as { data: { csrfToken: string } };
    const login = await fetch(`${origin}/api/admin/v1/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: loginCsrfCookie,
        'x-csrf-token': csrfBody.data.csrfToken
      },
      body: JSON.stringify({
        tenantSlug: 'tenant-a',
        username: 'admin',
        password: 'correct horse battery staple'
      })
    });
    const sessionCookie = cookieValue(
      login.headers.getSetCookie().find((value) => value.startsWith('__Host-raho_session='))!,
      '__Host-raho_session'
    );
    const loginBody = (await login.json()) as { data: { csrfToken: string } };

    const listed = await fetch(`${origin}/api/admin/v1/ai/provider-connections?tenantId=foreign`, {
      headers: { cookie: sessionCookie }
    });
    expect(listed.status).toBe(200);
    expect(listConnections).toHaveBeenCalledWith(repository.identity.tenantId);

    const payload = {
      name: 'OpenAI chat',
      purpose: 'chat',
      provider: 'openai',
      transport: 'native',
      baseUrl: null,
      modelId: 'gpt-model',
      dimensions: null,
      taskType: null,
      timeoutMs: 15_000,
      maxRetries: 0,
      maxOutputTokens: 512,
      generationConfig: {},
      credential: 'write-only-secret-value',
      reason: 'Menambahkan provider yang disetujui'
    };
    const withoutCsrf = await fetch(`${origin}/api/admin/v1/ai/provider-connections`, {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    expect(withoutCsrf.status).toBe(403);
    expect(createConnection).not.toHaveBeenCalled();

    const created = await fetch(`${origin}/api/admin/v1/ai/provider-connections`, {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
        'x-csrf-token': loginBody.data.csrfToken
      },
      body: JSON.stringify(payload)
    });
    expect(created.status).toBe(201);
    expect(createConnection).toHaveBeenCalledWith(
      repository.identity.tenantId,
      repository.identity.userId,
      expect.objectContaining({ credential: 'write-only-secret-value' }),
      expect.any(String)
    );
    expect(await created.text()).not.toContain('write-only-secret-value');

    const foreign = await fetch(
      `${origin}/api/admin/v1/ai/provider-connections/01988c36-6880-7000-8000-000000000099/models`,
      { headers: { cookie: sessionCookie } }
    );
    expect(foreign.status).toBe(404);
    expect(listModels).toHaveBeenCalledWith(
      repository.identity.tenantId,
      '01988c36-6880-7000-8000-000000000099'
    );
  });

  it('isolates QR and Last-Event-ID replay by authenticated tenant', async () => {
    const repository = new MemoryRepository();
    const eventHub = new TenantEventHub();
    const first = eventHub.publish(repository.identity.tenantId, 'overview', { revision: 1 });
    eventHub.publish('01988c36-6880-7000-8000-000000000099', 'overview', { revision: 99 });
    eventHub.publish(repository.identity.tenantId, 'overview', { revision: 2 });
    let qrTenantId: string | null = null;
    const reconnect = vi.fn(async () => {});
    const disconnect = vi.fn(async () => {});
    const origin = await start(repository, {
      eventHub,
      qrProvider: {
        get: async (tenantId) => {
          qrTenantId = tenantId;
          return { qr: 'short-lived-private-value', expiresAt: new Date(now.getTime() + 60_000) };
        }
      },
      whatsappSessionController: { reconnect, disconnect }
    });
    const csrfResponse = await fetch(`${origin}/api/admin/v1/auth/csrf`);
    const loginCsrfCookie = cookieValue(
      csrfResponse.headers.getSetCookie().join(';'),
      'raho_login_csrf'
    );
    const csrfBody = (await csrfResponse.json()) as { data: { csrfToken: string } };
    const login = await fetch(`${origin}/api/admin/v1/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: loginCsrfCookie,
        'x-csrf-token': csrfBody.data.csrfToken
      },
      body: JSON.stringify({
        tenantSlug: 'tenant-a',
        username: 'admin',
        password: 'correct horse battery staple'
      })
    });
    const sessionHeader = login.headers
      .getSetCookie()
      .find((value) => value.startsWith('__Host-raho_session='));
    const sessionCookie = cookieValue(sessionHeader!, '__Host-raho_session');
    const loginBody = (await login.json()) as { data: { csrfToken: string } };

    const qr = await fetch(`${origin}/api/admin/v1/session/qr?tenantId=tenant-b`, {
      headers: { cookie: sessionCookie }
    });
    expect(qr.status).toBe(200);
    expect(qr.headers.get('content-type')).toBe('image/png');
    expect(qrTenantId).toBe(repository.identity.tenantId);

    const mutationHeaders = {
      cookie: sessionCookie,
      'content-type': 'application/json',
      'x-csrf-token': loginBody.data.csrfToken
    };
    const reconnected = await fetch(`${origin}/api/admin/v1/session/reconnect`, {
      method: 'POST',
      headers: mutationHeaders,
      body: JSON.stringify({ expectedRevision: 0 })
    });
    expect(reconnected.status).toBe(200);
    expect(reconnect).toHaveBeenCalledWith(repository.identity.tenantId);

    const disconnected = await fetch(`${origin}/api/admin/v1/session/disconnect`, {
      method: 'POST',
      headers: mutationHeaders,
      body: JSON.stringify({ expectedRevision: 0, confirmation: 'PUTUS KONEKSI' })
    });
    expect(disconnected.status).toBe(200);
    expect(disconnect).toHaveBeenCalledWith(repository.identity.tenantId);

    const controller = new AbortController();
    const stream = await fetch(`${origin}/api/admin/v1/events/stream?tenantId=tenant-b`, {
      headers: { cookie: sessionCookie, 'last-event-id': first.id },
      signal: controller.signal
    });
    const chunk = await stream.body!.getReader().read();
    controller.abort();
    const text = new TextDecoder().decode(chunk.value);
    expect(text).toContain('"revision":2');
    expect(text).not.toContain('"revision":99');
  });
});
