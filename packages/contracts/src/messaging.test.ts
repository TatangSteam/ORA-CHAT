import { describe, expect, it } from 'vitest';

import {
  chatbotConfigRequestSchema,
  handoffNotificationUpdateRequestSchema,
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

  it('requires a valid Indonesian CS number when handoff notifications are enabled', () => {
    expect(
      handoffNotificationUpdateRequestSchema.safeParse({
        phone: '081234567890',
        enabled: true,
        expectedRevision: 0,
        reason: 'Mengaktifkan notifikasi CS'
      }).success
    ).toBe(true);
    expect(
      handoffNotificationUpdateRequestSchema.safeParse({
        phone: null,
        enabled: true,
        expectedRevision: 0,
        reason: 'Mengaktifkan notifikasi CS'
      }).success
    ).toBe(false);
    expect(
      handoffNotificationUpdateRequestSchema.safeParse({
        phone: '15551234567',
        enabled: false,
        expectedRevision: 0,
        reason: 'Menonaktifkan notifikasi CS'
      }).success
    ).toBe(false);
  });
});
