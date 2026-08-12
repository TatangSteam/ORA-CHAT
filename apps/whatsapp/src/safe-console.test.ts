import { describe, expect, it } from 'vitest';

import { isSensitiveSignalSessionLog } from './safe-console.js';

describe('WhatsApp console redaction', () => {
  it('detects the libsignal session dump that contains key material', () => {
    expect(isSensitiveSignalSessionLog(['Closing session:', { privateKey: 'must-not-log' }])).toBe(
      true
    );
  });

  it('does not suppress ordinary operational messages', () => {
    expect(isSensitiveSignalSessionLog(['WhatsApp connected'])).toBe(false);
  });
});
