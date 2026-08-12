import { describe, expect, it } from 'vitest';

import { recoveredMessageStatus } from './outbox.js';

describe('durable outbox recovery vocabulary', () => {
  it('maps a pre-send expired lease back to the queueable Message state', () => {
    expect(recoveredMessageStatus('retryable')).toBe('queued');
  });

  it('preserves post-send uncertainty for manual reconciliation', () => {
    expect(recoveredMessageStatus('unknown')).toBe('unknown');
  });
});
