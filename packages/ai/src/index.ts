import { lookup as dnsLookup } from 'node:dns/promises';
// Shared by the API connection controls and the asynchronous knowledge worker.
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

import {
  aiCapabilitiesSchema,
  aiStructuredAnswerSchema,
  aiUsageSchema,
  type AiCapabilities,
  type AiHealthState,
  type AiProvider,
  type AiPurpose,
  type AiStructuredAnswer,
  type AiUsage
} from '@raho/contracts';

const MAX_PROVIDER_RESPONSE_BYTES = 1_048_576;
const OFFICIAL_BASE_URLS: Partial<Record<AiProvider, string>> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta'
};

export interface ProviderConnectionRuntime {
  id: string;
  tenantId: string;
  purpose: AiPurpose;
  provider: AiProvider;
  baseUrl: string | null;
  modelId: string;
  dimensions: number | null;
  taskType: string | null;
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens: number;
  generationConfig: { temperature?: number; topP?: number };
  capabilitySnapshot?: AiCapabilities;
  credential: string | null;
}

export interface SafeHttpRequest {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
}

export interface SafeHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface ProviderHttpTransport {
  request(input: SafeHttpRequest): Promise<SafeHttpResponse>;
}

type Resolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

export interface SafeTransportOptions {
  production?: boolean;
  privateHostAllowlist?: readonly string[];
  allowedPrivatePorts?: readonly number[];
  resolver?: Resolver;
  maxResponseBytes?: number;
}

const parseIpv4 = (address: string): number[] | null => {
  if (isIP(address) !== 4) return null;
  return address.split('.').map(Number);
};

export const isBlockedNetworkAddress = (address: string): boolean => {
  const ipv4 = parseIpv4(address);
  if (ipv4) {
    const [a = 0, b = 0, c = 0] = ipv4;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      /^fe[89ab]/u.test(normalized) ||
      normalized.startsWith('ff') ||
      normalized.startsWith('100:') ||
      normalized.startsWith('2001:db8:') ||
      normalized.startsWith('::ffff:127.') ||
      normalized.startsWith('::ffff:10.') ||
      normalized.startsWith('::ffff:169.254.') ||
      normalized.startsWith('::ffff:172.') ||
      normalized.startsWith('::ffff:192.168.')
    );
  }
  return true;
};

const normalizeAllowlist = (values: readonly string[]): Set<string> =>
  new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));

export const validateProviderUrl = async (
  untrusted: string,
  options: SafeTransportOptions = {}
): Promise<{ url: URL; address: string; family: number }> => {
  if (untrusted.length > 2048) throw new Error('BLOCKED_URL');
  const url = new URL(untrusted);
  if (url.username || url.password || url.hash) throw new Error('BLOCKED_URL');
  const allowlist = normalizeAllowlist(options.privateHostAllowlist ?? []);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  const privateAllowed = allowlist.has(hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && privateAllowed)) {
    throw new Error('BLOCKED_URL');
  }
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (
    port !== 443 &&
    !(privateAllowed && (options.allowedPrivatePorts ?? [80, 443, 18789]).includes(port))
  ) {
    throw new Error('BLOCKED_URL');
  }
  if ((hostname === 'localhost' || hostname.endsWith('.local')) && !privateAllowed) {
    throw new Error('BLOCKED_URL');
  }
  const resolver: Resolver =
    options.resolver ??
    (async (target) =>
      dnsLookup(target, { all: true, verbatim: true }).then((records) =>
        records.map(({ address, family }) => ({ address, family }))
      ));
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await resolver(hostname);
  if (addresses.length === 0) throw new Error('BLOCKED_URL');
  if (!privateAllowed && addresses.some(({ address }) => isBlockedNetworkAddress(address))) {
    throw new Error('BLOCKED_URL');
  }
  const selected = addresses[0]!;
  return { url, address: selected.address, family: selected.family };
};

export class PinnedSafeHttpTransport implements ProviderHttpTransport {
  public constructor(private readonly options: SafeTransportOptions = {}) {}

  public async request(input: SafeHttpRequest): Promise<SafeHttpResponse> {
    const { url, address, family } = await validateProviderUrl(input.url, this.options);
    const body = input.body === undefined ? undefined : Buffer.from(JSON.stringify(input.body));
    const lookup: LookupFunction = (_hostname, lookupOptions, callback) => {
      if (lookupOptions.all) {
        callback(null, [{ address, family }]);
        return;
      }
      callback(null, address, family);
    };
    return new Promise((resolve, reject) => {
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || undefined,
          path: `${url.pathname}${url.search}`,
          method: input.method,
          headers: {
            accept: 'application/json',
            ...(body
              ? { 'content-length': String(body.length), 'content-type': 'application/json' }
              : {}),
            ...input.headers
          },
          lookup,
          signal: AbortSignal.timeout(input.timeoutMs)
        },
        (response) => {
          if ((response.statusCode ?? 500) >= 300 && (response.statusCode ?? 500) < 400) {
            response.resume();
            reject(new Error('PROVIDER_REDIRECT_BLOCKED'));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > (this.options.maxResponseBytes ?? MAX_PROVIDER_RESPONSE_BYTES)) {
              response.destroy(new Error('PROVIDER_RESPONSE_TOO_LARGE'));
              return;
            }
            chunks.push(chunk);
          });
          response.on('error', reject);
          response.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            let parsed: unknown = null;
            if (raw) {
              try {
                parsed = JSON.parse(raw);
              } catch {
                reject(new Error('PROVIDER_MALFORMED_RESPONSE'));
                return;
              }
            }
            resolve({
              status: response.statusCode ?? 500,
              headers: Object.fromEntries(
                Object.entries(response.headers).flatMap(([key, value]) =>
                  typeof value === 'string' ? [[key, value]] : []
                )
              ),
              body: parsed
            });
          });
        }
      );
      request.on('error', reject);
      if (body) request.write(body);
      request.end();
    });
  }
}

const capabilitiesFor = (connection: ProviderConnectionRuntime): AiCapabilities =>
  connection.capabilitySnapshot ??
  aiCapabilitiesSchema.parse({
    chat: connection.purpose === 'chat',
    embeddings: connection.provider !== 'anthropic' && connection.purpose === 'embedding',
    structuredOutput: connection.purpose === 'chat',
    modelList: connection.provider !== 'mock',
    streaming: connection.purpose === 'chat' && connection.provider !== 'mock',
    supportedParameters:
      connection.purpose === 'chat' ? ['temperature', 'topP', 'maxOutputTokens'] : [],
    dimensions: connection.dimensions ? [connection.dimensions] : null
  });

const baseUrlFor = (connection: ProviderConnectionRuntime): string => {
  const base = OFFICIAL_BASE_URLS[connection.provider] ?? connection.baseUrl;
  if (!base) throw new Error('BLOCKED_URL');
  return base.replace(/\/$/u, '');
};

const credentialHeaders = (connection: ProviderConnectionRuntime): Record<string, string> => {
  if (connection.provider === 'mock') return {};
  if (!connection.credential) throw new ProviderFailure('unauthorized');
  if (connection.provider === 'anthropic') {
    return { 'anthropic-version': '2023-06-01', 'x-api-key': connection.credential };
  }
  if (connection.provider === 'gemini') return { 'x-goog-api-key': connection.credential };
  return { authorization: `Bearer ${connection.credential}` };
};

export class ProviderFailure extends Error {
  public constructor(public readonly category: AiHealthState) {
    super(category);
  }
}

const categoryForStatus = (status: number): AiHealthState => {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'model_not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable';
  return 'incompatible';
};

const assertSuccess = (response: SafeHttpResponse): void => {
  if (response.status < 200 || response.status >= 300) {
    throw new ProviderFailure(categoryForStatus(response.status));
  }
};

const normalizedTransportFailure = (error: unknown): ProviderFailure => {
  if (error instanceof ProviderFailure) return error;
  const code = error instanceof Error ? error.message.toLowerCase() : '';
  if (code.includes('blocked_url') || code.includes('redirect_blocked')) {
    return new ProviderFailure('blocked_url');
  }
  if (code.includes('timeout') || code.includes('abort')) return new ProviderFailure('timeout');
  if (code.includes('malformed_response') || code.includes('response_too_large')) {
    return new ProviderFailure('incompatible');
  }
  return new ProviderFailure('unavailable');
};

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;

const parseJsonText = (value: unknown): AiStructuredAnswer => {
  if (typeof value !== 'string') throw new ProviderFailure('incompatible');
  const trimmed = value.trim();
  const normalized = trimmed.startsWith('```')
    ? trimmed
        .replace(/^```(?:json)?\s*/iu, '')
        .replace(/\s*```$/u, '')
        .trim()
    : trimmed;
  try {
    return aiStructuredAnswerSchema.parse(JSON.parse(normalized));
  } catch {
    throw new ProviderFailure('incompatible');
  }
};

const requestIdFrom = (headers: Record<string, string>): string | null => {
  const value = headers['x-request-id'] ?? headers['request-id'] ?? headers['x-goog-request-id'];
  return value && /^[a-zA-Z0-9._:-]{1,128}$/u.test(value) ? value : null;
};

export interface StructuredGenerationResult {
  output: AiStructuredAnswer;
  usage: AiUsage;
  actualModel: string;
  providerRequestId: string | null;
}

const emptyUsage = (): AiUsage =>
  aiUsageSchema.parse({
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    cachedTokens: null
  });

const STRUCTURED_ANSWER_INSTRUCTION =
  'Return only one JSON object with exactly these fields: "answer" (string), "status" (one of "answered", "fallback", or "handoff"), "shouldHandoff" (boolean), and "citations" (array of strings). Do not use Markdown or add other fields.';

export class AiProviderAdapter {
  public constructor(
    private readonly connection: ProviderConnectionRuntime,
    private readonly transport: ProviderHttpTransport
  ) {}

  public capabilities(): AiCapabilities {
    return capabilitiesFor(this.connection);
  }

  private async request(input: SafeHttpRequest): Promise<SafeHttpResponse> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.connection.maxRetries; attempt += 1) {
      try {
        const response = await this.transport.request(input);
        if (
          attempt < this.connection.maxRetries &&
          (response.status === 429 || response.status >= 500)
        ) {
          await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt >= this.connection.maxRetries) break;
        await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
      }
    }
    throw normalizedTransportFailure(lastError);
  }

  public async listModels(): Promise<string[]> {
    if (this.connection.provider === 'mock') return [this.connection.modelId];
    if (!this.capabilities().modelList) return [this.connection.modelId];
    const response = await this.request({
      url: `${baseUrlFor(this.connection)}/models`,
      method: 'GET',
      headers: credentialHeaders(this.connection),
      timeoutMs: this.connection.timeoutMs
    });
    assertSuccess(response);
    const body = object(response.body);
    const values = array(body.data ?? body.models);
    return values
      .map((entry) => {
        const item = object(entry);
        const id = item.id ?? item.name;
        return typeof id === 'string' ? id.replace(/^models\//u, '') : null;
      })
      .filter((value): value is string => Boolean(value));
  }

  public async generateStructured(
    prompt: string,
    sessionKey?: string
  ): Promise<StructuredGenerationResult> {
    if (this.connection.purpose !== 'chat') throw new ProviderFailure('incompatible');
    if (this.connection.provider === 'mock') {
      if (this.connection.modelId === 'mock-malformed') throw new ProviderFailure('incompatible');
      const citation = prompt.match(/\[(K\d+)\]/u)?.[1];
      return {
        output: aiStructuredAnswerSchema.parse({
          answer: `Mock: ${prompt.slice(0, 120)}`,
          status: 'answered',
          shouldHandoff: false,
          citations: citation ? [citation] : []
        }),
        usage: aiUsageSchema.parse({
          inputTokens: prompt.length,
          outputTokens: 8,
          totalTokens: prompt.length + 8,
          cachedTokens: 0
        }),
        actualModel: this.connection.modelId,
        providerRequestId: 'mock-request'
      };
    }
    const capabilities = this.capabilities();
    const generation = this.connection.generationConfig;
    const temperature = capabilities.supportedParameters.includes('temperature')
      ? generation.temperature
      : undefined;
    const topP = capabilities.supportedParameters.includes('topP') ? generation.topP : undefined;
    const maxOutputTokens = capabilities.supportedParameters.includes('maxOutputTokens')
      ? this.connection.maxOutputTokens
      : undefined;
    const base = baseUrlFor(this.connection);
    let url: string;
    let body: Record<string, unknown>;
    if (this.connection.provider === 'openai') {
      url = `${base}/responses`;
      body = {
        model: this.connection.modelId,
        input: prompt,
        ...(maxOutputTokens !== undefined ? { max_output_tokens: maxOutputTokens } : {}),
        text: {
          format: {
            type: 'json_schema',
            name: 'raho_answer',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['answer', 'status', 'shouldHandoff', 'citations'],
              properties: {
                answer: { type: 'string' },
                status: { type: 'string', enum: ['answered', 'fallback', 'handoff'] },
                shouldHandoff: { type: 'boolean' },
                citations: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        },
        ...(temperature !== undefined ? { temperature } : {}),
        ...(topP !== undefined ? { top_p: topP } : {})
      };
    } else if (this.connection.provider === 'anthropic') {
      url = `${base}/messages`;
      body = {
        model: this.connection.modelId,
        ...(maxOutputTokens !== undefined ? { max_tokens: maxOutputTokens } : {}),
        messages: [{ role: 'user', content: prompt }],
        ...(temperature !== undefined ? { temperature } : {}),
        ...(topP !== undefined ? { top_p: topP } : {})
      };
    } else if (this.connection.provider === 'gemini') {
      url = `${base}/models/${encodeURIComponent(this.connection.modelId)}:generateContent`;
      body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
          ...(temperature !== undefined ? { temperature } : {}),
          ...(topP !== undefined ? { topP } : {})
        }
      };
    } else {
      url = `${base}/chat/completions`;
      body = {
        model: this.connection.modelId,
        messages: [
          { role: 'system', content: STRUCTURED_ANSWER_INSTRUCTION },
          {
            role: 'user',
            content: `${prompt}\n\nOUTPUT FORMAT (required): ${STRUCTURED_ANSWER_INSTRUCTION}`
          }
        ],
        ...(maxOutputTokens !== undefined ? { max_tokens: maxOutputTokens } : {}),
        response_format: { type: 'json_object' },
        ...(temperature !== undefined ? { temperature } : {}),
        ...(topP !== undefined ? { top_p: topP } : {}),
        ...(this.connection.provider === 'openclaw-gateway' && sessionKey
          ? { user: sessionKey }
          : {})
      };
    }
    const response = await this.request({
      url,
      method: 'POST',
      headers: credentialHeaders(this.connection),
      body,
      timeoutMs: this.connection.timeoutMs
    });
    assertSuccess(response);
    const payload = object(response.body);
    let text: unknown;
    if (this.connection.provider === 'openai') {
      if (payload.output_text !== undefined) {
        text = payload.output_text;
      } else {
        const output = object(array(payload.output)[0]);
        text = object(array(output.content)[0]).text;
      }
    } else if (this.connection.provider === 'anthropic') {
      text = object(array(payload.content)[0]).text;
    } else if (this.connection.provider === 'gemini') {
      const candidate = object(array(payload.candidates)[0]);
      const content = object(candidate.content);
      text = object(array(content.parts)[0]).text;
    } else {
      text = object(object(array(payload.choices)[0]).message).content;
    }
    const usage = object(payload.usage ?? payload.usageMetadata);
    const inputTokens = numberOrNull(
      usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokenCount
    );
    const outputTokens = numberOrNull(
      usage.output_tokens ?? usage.completion_tokens ?? usage.candidatesTokenCount
    );
    return {
      output: parseJsonText(text),
      usage: aiUsageSchema.parse({
        inputTokens,
        outputTokens,
        totalTokens:
          numberOrNull(usage.total_tokens ?? usage.totalTokenCount) ??
          (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null),
        cachedTokens: numberOrNull(usage.cached_tokens ?? usage.cachedContentTokenCount)
      }),
      actualModel: typeof payload.model === 'string' ? payload.model : this.connection.modelId,
      providerRequestId: requestIdFrom(response.headers)
    };
  }

  public async embedQuery(input: string): Promise<{ vector: number[]; usage: AiUsage }> {
    if (this.connection.purpose !== 'embedding' || this.connection.provider === 'anthropic') {
      throw new ProviderFailure('incompatible');
    }
    if (this.connection.provider === 'mock') {
      const dimensions = this.connection.dimensions ?? 8;
      return {
        vector: Array.from({ length: dimensions }, (_, index) => (index + 1) / dimensions),
        usage: emptyUsage()
      };
    }
    const base = baseUrlFor(this.connection);
    const url =
      this.connection.provider === 'gemini'
        ? `${base}/models/${encodeURIComponent(this.connection.modelId)}:embedContent`
        : `${base}/embeddings`;
    const body =
      this.connection.provider === 'gemini'
        ? {
            model: `models/${this.connection.modelId}`,
            content: { parts: [{ text: input }] },
            ...(this.connection.taskType ? { taskType: this.connection.taskType } : {}),
            ...(this.connection.dimensions
              ? { outputDimensionality: this.connection.dimensions }
              : {})
          }
        : {
            model: this.connection.modelId,
            input,
            ...(this.connection.dimensions ? { dimensions: this.connection.dimensions } : {})
          };
    const response = await this.request({
      url,
      method: 'POST',
      headers: credentialHeaders(this.connection),
      body,
      timeoutMs: this.connection.timeoutMs
    });
    assertSuccess(response);
    const payload = object(response.body);
    const rawVector =
      this.connection.provider === 'gemini'
        ? object(payload.embedding).values
        : object(array(payload.data)[0]).embedding;
    const vector = array(rawVector).filter((value): value is number => typeof value === 'number');
    if (!this.connection.dimensions || vector.length !== this.connection.dimensions) {
      throw new ProviderFailure('incompatible');
    }
    return { vector, usage: emptyUsage() };
  }

  public async testConnection(): Promise<{
    healthState: AiHealthState;
    capabilities: AiCapabilities;
    models: string[];
    latencyMs: number;
    actualModel: string;
    providerRequestId: string | null;
  }> {
    const started = performance.now();
    try {
      const models = await this.listModels();
      if (models.length > 0 && !models.includes(this.connection.modelId)) {
        throw new ProviderFailure('model_not_found');
      }
      const result =
        this.connection.purpose === 'chat'
          ? await this.generateStructured('Return a safe JSON health response only.')
          : await this.embedQuery('raho connection probe');
      return {
        healthState: 'ready',
        capabilities: this.capabilities(),
        models,
        latencyMs: Math.max(0, Math.round(performance.now() - started)),
        actualModel: 'actualModel' in result ? result.actualModel : this.connection.modelId,
        providerRequestId: 'providerRequestId' in result ? result.providerRequestId : null
      };
    } catch (error) {
      throw normalizedTransportFailure(error);
    }
  }
}

export const openClawSessionKey = (tenantId: string, conversationId: string): string =>
  `tenant:${tenantId}:conversation:${conversationId}`;
