import { describe, expect, it } from 'vitest';

import { AiProbeRateLimiter } from './rate-limit.js';

describe('AI discovery and probe limiter', () => {
  it('shares a fixed request budget per identity and resets after a minute', () => {
    let now = 0;
    const limiter = new AiProbeRateLimiter(() => now);
    for (let request = 0; request < 10; request += 1)
      expect(limiter.consume('tenant:user').allowed).toBe(true);
    expect(limiter.consume('tenant:user')).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(limiter.consume('tenant:other-user').allowed).toBe(true);
    now = 60_000;
    expect(limiter.consume('tenant:user').allowed).toBe(true);
  });
});
