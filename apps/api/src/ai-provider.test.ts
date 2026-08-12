import { describe, expect, it, vi } from 'vitest';

import {
  AiProviderAdapter,
  isBlockedNetworkAddress,
  openClawSessionKey,
  PinnedSafeHttpTransport,
  ProviderFailure,
  validateProviderUrl,
  type ProviderConnectionRuntime,
  type ProviderHttpTransport,
  type SafeHttpRequest,
  type SafeHttpResponse
} from './ai-provider.js';

class FixtureTransport implements ProviderHttpTransport {
  public readonly requests: SafeHttpRequest[] = [];
  public constructor(private readonly responses: Array<SafeHttpResponse | Error>) {}

  public async request(input: SafeHttpRequest): Promise<SafeHttpResponse> {
    this.requests.push(input);
    const response = this.responses.shift();
    if (!response) throw new Error('Missing fixture response');
    if (response instanceof Error) throw response;
    return response;
  }
}

const connection = (
  provider: ProviderConnectionRuntime['provider'],
  purpose: ProviderConnectionRuntime['purpose'] = 'chat'
): ProviderConnectionRuntime => ({
  id: 'connection-id',
  tenantId: 'tenant-id',
  purpose,
  provider,
  baseUrl:
    provider === 'openai-compatible'
      ? 'https://provider.example/v1'
      : provider === 'openclaw-gateway'
        ? 'http://openclaw:18789/v1'
        : null,
  modelId: provider === 'mock' ? 'mock-safe' : 'model-a',
  dimensions: purpose === 'embedding' ? 3 : null,
  taskType: purpose === 'embedding' ? 'RETRIEVAL_QUERY' : null,
  timeoutMs: 5_000,
  maxRetries: 0,
  maxOutputTokens: 256,
  generationConfig: { temperature: 0.2, topP: 0.8 },
  credential: provider === 'mock' ? null : 'credential-value'
});

const successEnvelope = (provider: ProviderConnectionRuntime['provider']): unknown => {
  const text = JSON.stringify({
    answer: 'Aman',
    status: 'answered',
    shouldHandoff: false,
    citations: []
  });
  if (provider === 'openai') return { output_text: text, model: 'model-a', usage: {} };
  if (provider === 'anthropic') return { content: [{ text }], model: 'model-a', usage: {} };
  if (provider === 'gemini') {
    return { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: {} };
  }
  return { choices: [{ message: { content: text } }], model: 'model-a', usage: {} };
};

describe('SSRF-safe provider URL', () => {
  it('blocks credentials, fragments, private DNS results, unsafe protocols, and ports', async () => {
    const resolver = vi.fn(async () => [{ address: '10.0.0.8', family: 4 }]);
    await expect(validateProviderUrl('https://provider.example/v1', { resolver })).rejects.toThrow(
      'BLOCKED_URL'
    );
    await expect(
      validateProviderUrl('https://user:pass@provider.example/v1', { resolver })
    ).rejects.toThrow('BLOCKED_URL');
    await expect(validateProviderUrl('file:///etc/passwd', { resolver })).rejects.toThrow(
      'BLOCKED_URL'
    );
    await expect(
      validateProviderUrl('https://provider.example:8443/v1', {
        resolver: async () => [{ address: '203.0.113.10', family: 4 }]
      })
    ).rejects.toThrow('BLOCKED_URL');
  });

  it('allows an explicitly named private OpenClaw host while retaining port policy', async () => {
    await expect(
      validateProviderUrl('http://openclaw:18789/v1', {
        privateHostAllowlist: ['openclaw'],
        allowedPrivatePorts: [18789],
        resolver: async () => [{ address: '172.20.0.9', family: 4 }]
      })
    ).resolves.toMatchObject({ address: '172.20.0.9' });
  });

  it('classifies private, metadata, loopback, multicast, and unspecified ranges', () => {
    for (const address of [
      '0.0.0.0',
      '10.0.0.1',
      '127.0.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '192.168.1.1',
      '192.0.2.1',
      '198.51.100.2',
      '203.0.113.2',
      '::',
      '::1',
      'fd00::1',
      'fe80::1'
    ]) {
      expect(isBlockedNetworkAddress(address), address).toBe(true);
    }
    expect(isBlockedNetworkAddress('8.8.8.8')).toBe(false);
    expect(isBlockedNetworkAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('pins the validated DNS address and rejects redirects without following them', async () => {
    const transport = new PinnedSafeHttpTransport({
      resolver: async () => [{ address: '127.0.0.1', family: 4 }],
      privateHostAllowlist: ['fixture'],
      allowedPrivatePorts: [9]
    });
    await expect(
      transport.request({
        url: 'http://fixture:9/v1',
        method: 'GET',
        headers: {},
        timeoutMs: 100
      })
    ).rejects.toBeDefined();
  });
});

describe('native and compatible provider adapter contracts', () => {
  for (const provider of [
    'openai',
    'anthropic',
    'gemini',
    'openai-compatible',
    'openclaw-gateway'
  ] as const) {
    it(`normalizes structured output for ${provider}`, async () => {
      const transport = new FixtureTransport([
        {
          status: 200,
          headers: {},
          body:
            provider === 'gemini'
              ? { models: [{ name: 'models/model-a' }] }
              : { data: [{ id: 'model-a' }] }
        },
        {
          status: 200,
          headers: { 'x-request-id': 'safe-request-id' },
          body: successEnvelope(provider)
        }
      ]);
      const result = await new AiProviderAdapter(connection(provider), transport).testConnection();
      expect(result.healthState).toBe('ready');
      expect(result.actualModel).toBe('model-a');
      expect(transport.requests.flatMap(({ headers }) => Object.keys(headers))).not.toContain(
        'cookie'
      );
    });
  }

  it('uses a stable OpenClaw session key without granting tools or sending vendor upstream keys', async () => {
    const transport = new FixtureTransport([
      { status: 200, headers: {}, body: successEnvelope('openclaw-gateway') }
    ]);
    const adapter = new AiProviderAdapter(connection('openclaw-gateway'), transport);
    const key = openClawSessionKey('tenant-a', 'conversation-a');
    await adapter.generateStructured('Halo', key);
    expect(key).toBe('tenant:tenant-a:conversation:conversation-a');
    expect(transport.requests[0]?.body).toMatchObject({ user: key });
    expect(JSON.stringify(transport.requests[0]?.body)).not.toMatch(
      /tools|shell|filesystem|browser/iu
    );
  });

  it('omits generation parameters when the model capability does not support them', async () => {
    const runtime = connection('openai-compatible');
    runtime.capabilitySnapshot = {
      chat: true,
      embeddings: false,
      structuredOutput: true,
      modelList: true,
      streaming: false,
      supportedParameters: ['maxOutputTokens'],
      dimensions: null
    };
    const transport = new FixtureTransport([
      { status: 200, headers: {}, body: successEnvelope('openai-compatible') }
    ]);
    await new AiProviderAdapter(runtime, transport).generateStructured('Halo');
    expect(transport.requests[0]?.body).not.toHaveProperty('temperature');
    expect(transport.requests[0]?.body).not.toHaveProperty('top_p');
  });

  for (const provider of [
    'mock',
    'openai',
    'gemini',
    'openai-compatible',
    'openclaw-gateway'
  ] as const) {
    it(`validates embedding dimensions for ${provider}`, async () => {
      const runtime = connection(provider, 'embedding');
      const response =
        provider === 'gemini'
          ? { embedding: { values: [0.1, 0.2, 0.3] } }
          : { data: [{ embedding: [0.1, 0.2, 0.3] }] };
      const transport = new FixtureTransport(
        provider === 'mock' ? [] : [{ status: 200, headers: {}, body: response }]
      );
      await expect(
        new AiProviderAdapter(runtime, transport).embedQuery('query')
      ).resolves.toMatchObject({
        vector: [expect.any(Number), expect.any(Number), expect.any(Number)]
      });
    });
  }
});

describe('safe provider failures', () => {
  for (const [status, category] of [
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'model_not_found'],
    [429, 'rate_limited'],
    [500, 'unavailable']
  ] as const) {
    it(`maps HTTP ${status} to ${category} without exposing a raw body`, async () => {
      const transport = new FixtureTransport([
        { status, headers: {}, body: { secret: 'must-not-leak', vendor: 'raw-error' } }
      ]);
      const adapter = new AiProviderAdapter(connection('openai'), transport);
      await expect(adapter.listModels()).rejects.toMatchObject({ category });
    });
  }

  it('turns malformed structured output into incompatible', async () => {
    const transport = new FixtureTransport([
      { status: 200, headers: {}, body: { output_text: '{bad json' } }
    ]);
    await expect(
      new AiProviderAdapter(connection('openai'), transport).generateStructured('probe')
    ).rejects.toEqual(new ProviderFailure('incompatible'));
  });

  it('maps transport timeout and SSRF denial to safe categories', async () => {
    for (const [error, category] of [
      [new Error('TimeoutError'), 'timeout'],
      [new Error('BLOCKED_URL'), 'blocked_url']
    ] as const) {
      const transport = new FixtureTransport([error]);
      await expect(
        new AiProviderAdapter(connection('openai'), transport).testConnection()
      ).rejects.toMatchObject({ category });
    }
  });
});
