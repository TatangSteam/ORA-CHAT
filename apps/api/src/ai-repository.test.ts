import { sealCredential } from '@raho/db';
import { describe, expect, it, vi } from 'vitest';

import { PrismaAiRepository } from './ai-repository.js';
import type { SafeHttpRequest, SafeHttpResponse } from './ai-provider.js';

const tenantId = '01988c36-6880-7000-8000-000000000001';
const connectionId = '01988c36-6880-7000-8000-000000000002';
const actorId = '01988c36-6880-7000-8000-000000000003';
const masterKey = Buffer.alloc(32, 7);
const now = new Date('2026-11-12T00:00:00.000Z');
const candidate = {
  modelId: 'candidate-model',
  expectedRevision: 3,
  reason: 'Switch to selected model'
};
const apply = { ...candidate, expectedIntegrationRevision: 4 };

const success: SafeHttpResponse = {
  status: 200,
  headers: { 'x-request-id': 'safe-request' },
  body: {
    model: 'candidate-model',
    choices: [
      {
        message: {
          content: JSON.stringify({
            answer: 'Ready',
            status: 'answered',
            shouldHandoff: false,
            citations: []
          })
        }
      }
    ],
    usage: {}
  }
};

const matches = (row: object, where: Record<string, unknown>) =>
  Object.entries(where).every(([key, value]) => (row as Record<string, unknown>)[key] === value);

const updateRow = (row: object, data: Record<string, unknown>) => {
  const target = row as Record<string, unknown>;
  for (const [key, value] of Object.entries(data)) {
    target[key] =
      value && typeof value === 'object' && 'increment' in value
        ? Number(target[key]) + Number(value.increment)
        : value;
  }
};

const fixture = (responses: SafeHttpResponse[] = [success]) => {
  const sealed = sealCredential(
    'synthetic-stored-key',
    { tenantId, provider: 'openai-compatible', purpose: 'chat' },
    masterKey
  );
  const state = {
    connection: {
      id: connectionId,
      tenantId,
      credentialId: 'stored-credential',
      name: 'Gateway chat',
      purpose: 'chat',
      provider: 'openai-compatible',
      transport: 'compatible',
      baseUrl: 'https://gateway.example/v1',
      modelId: 'working-model',
      dimensions: null,
      taskType: null,
      timeoutMs: 15_000,
      maxRetries: 0,
      maxOutputTokens: 512,
      generationConfig: {},
      capabilitySnapshot: {},
      healthState: 'ready',
      lastTestErrorCode: null,
      lastTestedAt: now,
      testedRevision: 3,
      revision: 3,
      updatedAt: now,
      credential: {
        ...sealed,
        encryptedCiphertext: Uint8Array.from(sealed.encryptedCiphertext),
        encryptedDataKey: Uint8Array.from(sealed.encryptedDataKey),
        nonce: Uint8Array.from(sealed.nonce),
        rotatedAt: now,
        revokedAt: null
      }
    },
    integration: {
      id: 'integration',
      tenantId,
      name: 'default',
      activeChatConnectionId: connectionId,
      activeEmbeddingConnectionId: null,
      activeEmbeddingIndexVersionId: null,
      generationEnabled: true,
      retrievalEnabled: false,
      strictGrounding: true,
      status: 'active',
      revision: 4,
      updatedAt: now
    }
  };
  const hooks: { onRequest?: () => void } = {};
  const request = vi.fn(async (_input: SafeHttpRequest) => {
    void _input;
    hooks.onRequest?.();
    const response = responses.shift();
    if (!response) throw new Error('Missing fixture response');
    return response;
  });
  const auditCreate = vi.fn(async () => ({}));
  const transaction = vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => {
    const draft = structuredClone(state);
    const result = await operation({
      aiProviderConnection: {
        updateMany: async ({
          where,
          data
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          if (!matches(draft.connection, where)) return { count: 0 };
          updateRow(draft.connection, data);
          return { count: 1 };
        },
        findUniqueOrThrow: async () => draft.connection
      },
      aiIntegration: {
        updateMany: async ({
          where,
          data
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          if (!matches(draft.integration, where)) return { count: 0 };
          updateRow(draft.integration, data);
          return { count: 1 };
        },
        findUniqueOrThrow: async () => draft.integration
      },
      auditLog: { create: auditCreate }
    });
    Object.assign(state, draft);
    return result;
  });
  const findFirst = vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
    matches(state.connection, where) ? structuredClone(state.connection) : null
  );
  const prisma = {
    aiProviderConnection: { findFirst },
    aiIntegration: { upsert: vi.fn(async () => structuredClone(state.integration)) },
    $transaction: transaction
  };
  const repository = new PrismaAiRepository(prisma as never, masterKey, { request }, () => now);
  return { repository, state, request, hooks, transaction, auditCreate, findFirst, prisma };
};

describe('draft and saved model discovery', () => {
  it('discovers draft model IDs without saving the credential or needing a model', async () => {
    const f = fixture([
      {
        status: 200,
        headers: {},
        body: { data: [{ id: 'z-model' }, { id: 'a-model' }, { id: 'a-model' }] }
      }
    ]);
    const result = await f.repository.discoverModels(tenantId, {
      provider: 'openai-compatible',
      transport: 'compatible',
      purpose: 'chat',
      baseUrl: 'https://draft.example/v1',
      credential: 'synthetic-draft-key',
      timeoutMs: 5_000
    });
    expect(result).toEqual({ status: 'ok', value: ['a-model', 'z-model'] });
    expect(f.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://draft.example/v1/models',
        method: 'GET',
        headers: { authorization: 'Bearer synthetic-draft-key' }
      })
    );
    expect(f.findFirst).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('synthetic');
  });

  it('uses the saved server credential and rejects another tenant before any provider request', async () => {
    const f = fixture([{ status: 200, headers: {}, body: { data: [{ id: 'available-model' }] } }]);
    expect(await f.repository.discoverModels('another-tenant', { connectionId })).toEqual({
      status: 'not_found'
    });
    expect(f.request).not.toHaveBeenCalled();
    expect(await f.repository.discoverModels(tenantId, { connectionId })).toEqual({
      status: 'ok',
      value: ['available-model']
    });
    expect(f.request.mock.calls[0]?.[0].headers).toEqual({
      authorization: 'Bearer synthetic-stored-key'
    });
  });

  it('returns a safe error category without exposing the provider body', async () => {
    const f = fixture([{ status: 401, headers: {}, body: { secret: 'raw-provider-secret' } }]);
    expect(await f.repository.discoverModels(tenantId, { connectionId })).toEqual({
      status: 'provider_failure',
      category: 'unauthorized'
    });
    expect(f.transaction).not.toHaveBeenCalled();
  });
});

describe('candidate model probes and atomic application', () => {
  it('tests a manually entered model directly, preserving active configuration and health', async () => {
    const f = fixture();
    const before = structuredClone(f.state);
    expect(await f.repository.testModelCandidate(tenantId, connectionId, candidate)).toMatchObject({
      status: 'ok',
      value: { modelId: 'candidate-model', healthState: 'ready', actualModel: 'candidate-model' }
    });
    expect(f.request).toHaveBeenCalledOnce();
    expect(f.request.mock.calls[0]?.[0]).toMatchObject({
      url: 'https://gateway.example/v1/chat/completions',
      body: { model: 'candidate-model', response_format: { type: 'json_object' } }
    });
    expect(f.state).toEqual(before);
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it('re-tests on Apply and commits the model, tested revision, and activation together', async () => {
    const f = fixture([success, success]);
    await f.repository.testModelCandidate(tenantId, connectionId, candidate);
    const result = await f.repository.applyModelCandidate(
      tenantId,
      actorId,
      connectionId,
      apply,
      'request-id'
    );
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      status: 'ok',
      value: {
        connection: {
          modelId: 'candidate-model',
          revision: 4,
          testedRevision: 4,
          healthState: 'ready',
          credentialConfigured: true
        },
        integration: { activeChatConnectionId: connectionId, generationEnabled: true, revision: 5 }
      }
    });
    expect(f.state.connection.modelId).toBe('candidate-model');
    expect(f.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId,
          action: 'ai.chat.model_applied',
          metadata: { previousModelId: 'working-model', modelId: 'candidate-model' }
        })
      })
    );
    expect(JSON.stringify(result)).not.toContain('synthetic-stored-key');
    expect(JSON.stringify(result)).not.toContain('encryptedCiphertext');
  });

  it('probes the persisted output limit and generation parameters before applying the candidate', async () => {
    const f = fixture();
    f.state.connection.maxOutputTokens = 8_192;
    f.state.connection.generationConfig = { temperature: 0.4, topP: 0.9 };
    const result = await f.repository.applyModelCandidate(
      tenantId,
      actorId,
      connectionId,
      apply,
      'request-id'
    );
    expect(f.request.mock.calls[0]?.[0].body).toMatchObject({
      model: 'candidate-model',
      max_tokens: 8_192,
      temperature: 0.4,
      top_p: 0.9
    });
    expect(result).toMatchObject({
      status: 'ok',
      value: {
        connection: {
          maxOutputTokens: 8_192,
          generationConfig: { temperature: 0.4, topP: 0.9 }
        }
      }
    });
  });

  it.each([401, 404, 429, 500])(
    'retains the working model when Apply receives HTTP %s',
    async (status) => {
      const f = fixture([{ status, headers: {}, body: { secret: 'must-not-leak' } }]);
      const before = structuredClone(f.state);
      expect(
        await f.repository.applyModelCandidate(tenantId, actorId, connectionId, apply, 'request-id')
      ).toMatchObject({ status: 'provider_failure' });
      expect(f.state).toEqual(before);
      expect(f.transaction).not.toHaveBeenCalled();
    }
  );

  it('rejects a successful HTTP completion with incompatible answer content', async () => {
    const f = fixture([
      { status: 200, headers: {}, body: { choices: [{ message: { content: 'plain text' } }] } }
    ]);
    const before = structuredClone(f.state);
    expect(
      await f.repository.applyModelCandidate(tenantId, actorId, connectionId, apply, 'request-id')
    ).toEqual({ status: 'provider_failure', category: 'incompatible' });
    expect(f.state).toEqual(before);
  });

  it('rejects stale input and foreign tenant references before probing', async () => {
    const f = fixture();
    expect(
      await f.repository.applyModelCandidate(
        'foreign-tenant',
        actorId,
        connectionId,
        apply,
        'request-id'
      )
    ).toEqual({ status: 'not_found' });
    expect(
      await f.repository.applyModelCandidate(
        tenantId,
        actorId,
        connectionId,
        { ...apply, expectedRevision: 2 },
        'request-id'
      )
    ).toEqual({ status: 'revision_conflict' });
    expect(
      await f.repository.applyModelCandidate(
        tenantId,
        actorId,
        connectionId,
        { ...apply, expectedIntegrationRevision: 3 },
        'request-id'
      )
    ).toEqual({ status: 'revision_conflict' });
    expect(f.request).not.toHaveBeenCalled();
  });

  it('rejects credential/config changes made while the candidate request is in flight', async () => {
    const f = fixture();
    f.hooks.onRequest = () => {
      f.state.connection.revision += 1;
    };
    expect(
      await f.repository.applyModelCandidate(tenantId, actorId, connectionId, apply, 'request-id')
    ).toEqual({ status: 'revision_conflict' });
    expect(f.state.connection.modelId).toBe('working-model');
    expect(f.state.integration.generationEnabled).toBe(true);
    expect(f.auditCreate).not.toHaveBeenCalled();
  });

  it('rolls back the model update when activation changes during the provider probe', async () => {
    const f = fixture();
    f.hooks.onRequest = () => {
      f.state.integration.revision += 1;
    };
    expect(
      await f.repository.applyModelCandidate(tenantId, actorId, connectionId, apply, 'request-id')
    ).toEqual({ status: 'revision_conflict' });
    expect(f.state.connection).toMatchObject({
      modelId: 'working-model',
      revision: 3,
      testedRevision: 3,
      healthState: 'ready'
    });
    expect(f.state.integration).toMatchObject({
      generationEnabled: true,
      activeChatConnectionId: connectionId,
      revision: 5
    });
    expect(f.auditCreate).not.toHaveBeenCalled();
  });

  it('reports a stale candidate Test if its configuration changed while probing', async () => {
    const f = fixture();
    f.hooks.onRequest = () => {
      f.state.connection.revision += 1;
    };
    expect(await f.repository.testModelCandidate(tenantId, connectionId, candidate)).toEqual({
      status: 'revision_conflict'
    });
    expect(f.state.connection.modelId).toBe('working-model');
  });

  it('keeps embedding selection on its existing reindex-aware workflow', async () => {
    const f = fixture();
    f.state.connection.purpose = 'embedding';
    expect(
      await f.repository.applyModelCandidate(tenantId, actorId, connectionId, apply, 'request-id')
    ).toEqual({ status: 'not_ready' });
    expect(f.request).not.toHaveBeenCalled();
  });
});
