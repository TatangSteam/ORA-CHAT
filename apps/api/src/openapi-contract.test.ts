import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { protectedRoutePolicies } from './route-policy.js';

type Operation = {
  parameters?: Array<{ $ref?: string }>;
  responses?: Record<string, unknown>;
  security?: Array<Record<string, unknown>>;
  'x-csrf'?: boolean;
  'x-permission'?: string;
};

type OpenApiDocument = {
  openapi: string;
  paths: Record<string, Record<string, Operation>>;
};

const document = JSON.parse(
  readFileSync(resolve('docs/openapi/admin-v1.openapi.json'), 'utf8')
) as OpenApiDocument;

describe('OpenAPI source contract', () => {
  it('documents every permission policy with matching auth and permission metadata', () => {
    expect(document.openapi).toBe('3.1.0');
    for (const policy of protectedRoutePolicies) {
      const path = policy.path.replace(':id', '{id}');
      const operation = document.paths[path]?.[policy.method.toLowerCase()];
      expect(operation, `${policy.method} ${path}`).toBeDefined();
      expect(operation?.['x-permission']).toBe(policy.permission);
      expect(operation?.security).toContainEqual({ sessionCookie: [] });
      expect(Object.keys(operation?.responses ?? {}).length).toBeGreaterThan(0);
      if (policy.method === 'POST') {
        expect(operation?.['x-csrf']).toBe(true);
        expect(operation?.parameters).toContainEqual({
          $ref: '#/components/parameters/Csrf'
        });
      }
    }
  });

  it('requires idempotency for outbound creation and bearer auth for inbound ingestion', () => {
    const outbound = document.paths['/api/admin/v1/messages']?.post;
    expect(outbound?.parameters).toContainEqual({
      $ref: '#/components/parameters/IdempotencyKey'
    });
    expect(document.paths['/internal/v1/whatsapp/inbound']?.post?.security).toContainEqual({
      internalBearer: []
    });
  });
});
