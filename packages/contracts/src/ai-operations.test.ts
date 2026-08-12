import { describe, expect, it } from 'vitest';

import {
  aiFeedbackSchema,
  aiReadinessDecisionSchema,
  aiTestCaseImportSchema,
  aiTestRunRequestSchema
} from './ai-operations.js';

describe('AI operations contracts', () => {
  it('accepts governed feedback and rejects unknown categories', () => {
    expect(
      aiFeedbackSchema.parse({
        rating: 'incorrect',
        category: 'wrong_source',
        note: 'Sitasi tidak mendukung jawaban.',
        reason: 'Review kualitas jawaban operasional'
      }).category
    ).toBe('wrong_source');
    expect(() =>
      aiFeedbackSchema.parse({ rating: 'bad', category: 'other', reason: 'Tidak valid' })
    ).toThrow();
  });

  it('bounds batch datasets and readiness decisions', () => {
    expect(() =>
      aiTestCaseImportSchema.parse({ cases: [], reason: 'Import dataset evaluasi kosong' })
    ).toThrow();
    expect(() =>
      aiTestRunRequestSchema.parse({
        testCaseIds: Array(101).fill(crypto.randomUUID()),
        reason: 'x'.repeat(8)
      })
    ).toThrow();
    expect(
      aiReadinessDecisionSchema.parse({
        expectedRevision: 0,
        status: 'approved',
        pilotPercentage: 10,
        reason: 'Membuka pilot terbatas setelah evaluasi'
      }).pilotPercentage
    ).toBe(10);
  });
});
