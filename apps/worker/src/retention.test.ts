import { describe, expect, it, vi } from 'vitest';

import {
  purgeExpiredIdempotencyKeys,
  purgeRetainedSessions,
  REVOKED_SESSION_RETENTION_MS
} from './retention.js';

describe('admin session retention', () => {
  it('purges only through a precise 30-day cutoff supplied to the repository', async () => {
    const deleteRetainedSessions = vi.fn(async () => 3);
    const now = new Date('2026-08-08T00:00:00.000Z');

    await expect(purgeRetainedSessions({ deleteRetainedSessions }, now)).resolves.toEqual({
      cutoff: new Date(now.getTime() - REVOKED_SESSION_RETENTION_MS),
      deleted: 3
    });
    expect(deleteRetainedSessions).toHaveBeenCalledOnce();
  });
});

describe('idempotency key retention', () => {
  it('purges only keys whose explicit seven-day expiry has elapsed', async () => {
    const deleteExpiredIdempotencyKeys = vi.fn(async () => 2);
    const now = new Date('2026-08-08T00:00:00.000Z');

    await expect(
      purgeExpiredIdempotencyKeys({ deleteExpiredIdempotencyKeys }, now)
    ).resolves.toEqual({ cutoff: now, deleted: 2 });
    expect(deleteExpiredIdempotencyKeys).toHaveBeenCalledWith(now);
  });
});
