import { describe, expect, it } from 'vitest';

import { renderMessageTemplate } from './template-repository.js';

describe('template renderer', () => {
  it('renders allowed variables and deterministic checklist symbols', () => {
    const checklist = [
      { id: 'first', sequence: 0, label: 'Nomor benar', required: true },
      { id: 'second', sequence: 1, label: 'Catatan opsional', required: false }
    ];
    expect(
      renderMessageTemplate(
        'Halo {{nama_pelanggan}}',
        ['nama_pelanggan'],
        { nama_pelanggan: 'Ayu' },
        checklist,
        new Map([['first', true]])
      )
    ).toBe('Halo Ayu\n\n☑ Nomor benar\n☐ Catatan opsional');
  });

  it('fails closed when a declared variable is missing', () => {
    expect(() =>
      renderMessageTemplate('Halo {{nama_pelanggan}}', ['nama_pelanggan'], {}, [])
    ).toThrow('TEMPLATE_VARIABLE_REQUIRED');
  });
});
