import { describe, expect, it } from 'vitest';

import {
  knowledgeItemCreateSchema,
  knowledgeLifecycleTransitionSchema,
  knowledgeMimeSchema,
  ragPlaygroundSchema
} from './knowledge.js';

describe('knowledge boundary contracts', () => {
  it('requires a governed reason and bounded dynamic content', () => {
    expect(
      knowledgeItemCreateSchema.safeParse({
        categoryId: null,
        title: 'Jam layanan',
        answer: 'Layanan tersedia pada hari kerja.',
        questionVariants: ['Kapan buka?'],
        reason: 'Menambah informasi yang telah diverifikasi'
      }).success
    ).toBe(true);
    expect(
      knowledgeLifecycleTransitionSchema.safeParse({
        target: 'draft',
        expectedRevision: 0,
        reason: 'Tidak boleh kembali menjadi draft'
      }).success
    ).toBe(false);
  });

  it('accepts only the approved document MIME set and bounded playground questions', () => {
    expect(knowledgeMimeSchema.safeParse('application/pdf').success).toBe(true);
    expect(knowledgeMimeSchema.safeParse('text/html').success).toBe(false);
    expect(ragPlaygroundSchema.safeParse({ question: 'Apa jam layanan?' }).success).toBe(true);
  });
});
