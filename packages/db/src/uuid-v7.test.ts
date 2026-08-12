import { describe, expect, it } from 'vitest';

import { generateUuidV7 } from './uuid-v7.js';

describe('UUIDv7 generation', () => {
  it('encodes the timestamp, version, and RFC variant', () => {
    const value = generateUuidV7(1_723_000_000_000);
    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    const compact = value.replaceAll('-', '');
    expect(Number.parseInt(compact.slice(0, 12), 16)).toBe(1_723_000_000_000);
  });
});
