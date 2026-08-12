import { describe, expect, it } from 'vitest';

import {
  chatbotConfigRequestSchema,
  maskPhone,
  normalizeIndonesianPhone,
  providerJidSchema
} from './messaging.js';

describe('messaging contracts', () => {
  it.each([
    ['081234567890', '6281234567890'],
    ['81234567890', '6281234567890'],
    ['+62 812-3456-7890', '6281234567890'],
    ['62.812.3456.7890', '6281234567890']
  ])('normalizes Indonesian phone %s', (input, expected) => {
    expect(normalizeIndonesianPhone(input)).toBe(expected);
  });

  it('rejects unsafe phone and provider identities', () => {
    expect(() => normalizeIndonesianPhone('15551234567')).toThrow();
    expect(providerJidSchema.safeParse('status@broadcast').success).toBe(false);
    expect(maskPhone('6281234567890')).toBe('6281••••890');
  });

  it('requires deterministic unique rule sequence', () => {
    const result = chatbotConfigRequestSchema.safeParse({
      expectedRevision: 0,
      fallback: 'Kami akan menghubungkan Anda dengan admin.',
      rules: [
        {
          sequence: 1,
          name: 'Menu pertama',
          triggerType: 'exact',
          trigger: '1',
          response: 'Informasi layanan',
          enabled: true
        },
        {
          sequence: 1,
          name: 'Duplikat',
          triggerType: 'contains',
          trigger: 'bantuan',
          response: 'Bantuan admin',
          enabled: true
        }
      ]
    });
    expect(result.success).toBe(false);
  });
});
