import { describe, expect, it } from 'vitest';
import { healthResponseSchema, serviceNameSchema } from './index.js';

describe('foundation contracts', () => {
  it('accepts registered service names', () => {
    expect(serviceNameSchema.parse('whatsapp')).toBe('whatsapp');
  });

  it('rejects unknown services', () => {
    expect(() => healthResponseSchema.parse({ service: 'redis', status: 'live' })).toThrow();
  });
});
