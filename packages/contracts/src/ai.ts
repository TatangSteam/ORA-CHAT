import { z } from 'zod';

export const aiProviderSchema = z.enum([
  'mock',
  'openai',
  'anthropic',
  'gemini',
  'openai-compatible',
  'openclaw-gateway'
]);
export const aiPurposeSchema = z.enum(['chat', 'embedding']);
export const aiTransportSchema = z.enum(['native', 'compatible', 'gateway']);
export const aiHealthStateSchema = z.enum([
  'not_tested',
  'ready',
  'reachable',
  'unauthorized',
  'forbidden',
  'quota_exceeded',
  'rate_limited',
  'model_not_found',
  'incompatible',
  'timeout',
  'blocked_url',
  'unavailable'
]);

export const aiGenerationConfigSchema = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional()
  })
  .strict();

const connectionFields = z
  .object({
    name: z.string().trim().min(2).max(160),
    purpose: aiPurposeSchema,
    provider: aiProviderSchema,
    transport: aiTransportSchema,
    baseUrl: z.url().max(2048).nullable().optional(),
    modelId: z
      .string()
      .trim()
      .min(1)
      .max(191)
      .regex(/^[a-zA-Z0-9._:/-]+$/u),
    dimensions: z.number().int().min(1).max(16_384).nullable().optional(),
    taskType: z.string().trim().min(1).max(64).nullable().optional(),
    timeoutMs: z.number().int().min(1_000).max(60_000).default(15_000),
    maxRetries: z.number().int().min(0).max(2).default(0),
    maxOutputTokens: z.number().int().min(16).max(32_768).default(512),
    generationConfig: aiGenerationConfigSchema.default({}),
    credential: z.string().min(8).max(8192).optional(),
    reason: z.string().trim().min(8).max(500)
  })
  .strict();

function validateConnection(
  value: z.infer<typeof connectionFields>,
  context: z.RefinementCtx
): void {
  if (value.provider === 'anthropic' && value.purpose === 'embedding') {
    context.addIssue({ code: 'custom', message: 'Anthropic native has no embedding support' });
  }
  const native = ['openai', 'anthropic', 'gemini'].includes(value.provider);
  if (native && (value.transport !== 'native' || value.baseUrl)) {
    context.addIssue({ code: 'custom', message: 'Native provider base URL is fixed' });
  }
  if (value.provider === 'openai-compatible') {
    if (value.transport !== 'compatible' || !value.baseUrl) {
      context.addIssue({ code: 'custom', message: 'Compatible provider requires a base URL' });
    }
  }
  if (value.provider === 'openclaw-gateway') {
    if (value.transport !== 'gateway' || !value.baseUrl?.endsWith('/v1')) {
      context.addIssue({ code: 'custom', message: 'OpenClaw requires a /v1 gateway URL' });
    }
  }
  if (value.provider === 'mock' && (value.baseUrl || value.transport !== 'native')) {
    context.addIssue({ code: 'custom', message: 'Mock provider has no base URL' });
  }
  if (value.purpose === 'embedding' && !value.dimensions) {
    context.addIssue({ code: 'custom', message: 'Embedding dimensions are required' });
  }
}

export const aiProviderConnectionCreateSchema = connectionFields.superRefine(validateConnection);
export const aiProviderConnectionUpdateSchema = connectionFields
  .omit({ credential: true })
  .extend({
    expectedRevision: z.number().int().min(0)
  })
  .strict()
  .superRefine(validateConnection);

export const aiCredentialReplaceSchema = z
  .object({
    credential: z.string().min(8).max(8192),
    expectedRevision: z.number().int().min(0),
    reason: z.string().trim().min(8).max(500)
  })
  .strict();
export const aiCredentialDeleteSchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    reason: z.string().trim().min(8).max(500)
  })
  .strict();
export const aiConnectionTestSchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    reason: z.string().trim().min(8).max(500)
  })
  .strict();
export const aiIntegrationActivationSchema = z
  .object({
    purpose: aiPurposeSchema,
    connectionId: z.uuid(),
    expectedRevision: z.number().int().min(0),
    reason: z.string().trim().min(8).max(500)
  })
  .strict();
export const aiIntegrationDeactivateSchema = z
  .object({
    purpose: aiPurposeSchema,
    expectedRevision: z.number().int().min(0),
    reason: z.string().trim().min(8).max(500)
  })
  .strict();

export const aiStructuredAnswerSchema = z
  .object({
    answer: z.string().trim().min(1).max(4096),
    status: z.enum(['answered', 'fallback', 'handoff']),
    shouldHandoff: z.boolean(),
    citations: z.array(z.string().trim().min(1).max(160)).max(20).default([])
  })
  .strict();

export const aiUsageSchema = z
  .object({
    inputTokens: z.number().int().min(0).nullable(),
    outputTokens: z.number().int().min(0).nullable(),
    totalTokens: z.number().int().min(0).nullable(),
    cachedTokens: z.number().int().min(0).nullable()
  })
  .strict();

export const aiCapabilitiesSchema = z
  .object({
    chat: z.boolean(),
    embeddings: z.boolean(),
    structuredOutput: z.boolean(),
    modelList: z.boolean(),
    streaming: z.boolean(),
    supportedParameters: z.array(z.enum(['temperature', 'topP', 'maxOutputTokens'])),
    dimensions: z.array(z.number().int().positive()).nullable()
  })
  .strict();

export type AiProvider = z.infer<typeof aiProviderSchema>;
export type AiPurpose = z.infer<typeof aiPurposeSchema>;
export type AiHealthState = z.infer<typeof aiHealthStateSchema>;
export type AiCapabilities = z.infer<typeof aiCapabilitiesSchema>;
export type AiStructuredAnswer = z.infer<typeof aiStructuredAnswerSchema>;
export type AiUsage = z.infer<typeof aiUsageSchema>;
export type AiProviderConnectionCreate = z.infer<typeof aiProviderConnectionCreateSchema>;
export type AiProviderConnectionUpdate = z.infer<typeof aiProviderConnectionUpdateSchema>;
export type AiCredentialReplace = z.infer<typeof aiCredentialReplaceSchema>;
export type AiCredentialDelete = z.infer<typeof aiCredentialDeleteSchema>;
export type AiConnectionTest = z.infer<typeof aiConnectionTestSchema>;
export type AiIntegrationActivation = z.infer<typeof aiIntegrationActivationSchema>;
export type AiIntegrationDeactivate = z.infer<typeof aiIntegrationDeactivateSchema>;
