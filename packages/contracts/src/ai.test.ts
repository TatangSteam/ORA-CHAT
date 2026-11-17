import { describe, expect, it } from 'vitest';

import {
  aiModelCandidateApplySchema,
  aiModelCandidateTestSchema,
  aiModelDiscoverySchema
} from './ai.js';

const draft = {
  provider: 'openai-compatible',
  transport: 'compatible',
  purpose: 'chat',
  baseUrl: 'https://gateway.example/v1',
  credential: 'synthetic-test-key'
};

describe('AI model selection contracts', () => {
  it('discovers a draft without a model and accepts a saved connection without a credential', () => {
    expect(aiModelDiscoverySchema.parse(draft)).toMatchObject({ timeoutMs: 15_000 });
    expect(
      aiModelDiscoverySchema.parse({ connectionId: '01988c36-6880-7000-8000-000000000001' })
    ).toEqual({ connectionId: '01988c36-6880-7000-8000-000000000001' });
    expect(aiModelDiscoverySchema.safeParse({ ...draft, purpose: 'embedding' }).success).toBe(true);
  });

  it('rejects mixed saved/draft credentials, unsupported transports, and editable native URLs', () => {
    expect(
      aiModelDiscoverySchema.safeParse({
        ...draft,
        connectionId: '01988c36-6880-7000-8000-000000000001'
      }).success
    ).toBe(false);
    expect(aiModelDiscoverySchema.safeParse({ ...draft, transport: 'native' }).success).toBe(false);
    expect(
      aiModelDiscoverySchema.safeParse({ ...draft, provider: 'openai', transport: 'native' })
        .success
    ).toBe(false);
  });

  it('bounds candidate IDs and requires both revisions for apply', () => {
    const candidate = {
      modelId: 'vendor/model:latest',
      expectedRevision: 3,
      reason: 'Select tested model'
    };
    expect(aiModelCandidateTestSchema.safeParse(candidate).success).toBe(true);
    expect(aiModelCandidateApplySchema.safeParse(candidate).success).toBe(false);
    expect(
      aiModelCandidateApplySchema.safeParse({ ...candidate, expectedIntegrationRevision: 2 })
        .success
    ).toBe(true);
    expect(
      aiModelCandidateApplySchema.safeParse({
        ...candidate,
        modelId: 'unsafe model',
        expectedIntegrationRevision: 2
      }).success
    ).toBe(false);
    expect(
      aiModelCandidateTestSchema.safeParse({ ...candidate, credential: 'not-accepted' }).success
    ).toBe(false);
  });
});
