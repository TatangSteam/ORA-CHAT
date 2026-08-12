import { describe, expect, it } from 'vitest';

import { templatePreviewSchema, templateVersionInputSchema } from './templates.js';

describe('message template contracts', () => {
  it('accepts only declared supported placeholders and unique checklist order', () => {
    expect(
      templateVersionInputSchema.parse({
        body: 'Halo {{nama_pelanggan}}, tanggal {{tanggal}}.',
        variableSchema: ['nama_pelanggan', 'tanggal'],
        checklist: [{ sequence: 0, label: 'Nomor sudah diverifikasi', required: true }]
      })
    ).toMatchObject({ variableSchema: ['nama_pelanggan', 'tanggal'] });
  });

  it('rejects undeclared or unsupported placeholders', () => {
    expect(
      templateVersionInputSchema.safeParse({
        body: 'Rahasia {{api_key}}',
        variableSchema: [],
        checklist: []
      }).success
    ).toBe(false);
    expect(
      templateVersionInputSchema.safeParse({
        body: 'Halo {{nama_pelanggan}}',
        variableSchema: [],
        checklist: []
      }).success
    ).toBe(false);
  });

  it('accepts only the variable subset requested by a template version', () => {
    expect(
      templatePreviewSchema.parse({
        templateVersionId: '01988c36-6880-7000-8000-000000000001',
        variables: { nama_pelanggan: 'Ayu', tanggal: '10 Agustus 2026' }
      }).variables
    ).toEqual({ nama_pelanggan: 'Ayu', tanggal: '10 Agustus 2026' });
    expect(
      templatePreviewSchema.safeParse({
        templateVersionId: '01988c36-6880-7000-8000-000000000001',
        variables: { variable_rahasia: 'ditolak' }
      }).success
    ).toBe(false);
  });
});
