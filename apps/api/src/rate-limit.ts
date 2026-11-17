import { keyedHash } from './security.js';

export class AiProbeRateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  public constructor(private readonly now: () => number = Date.now) {}

  public consume(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const current = this.now();
    for (const [expiredKey, window] of this.windows) {
      if (window.resetAt <= current) this.windows.delete(expiredKey);
    }
    const window = this.windows.get(key) ?? { count: 0, resetAt: current + 60_000 };
    this.windows.set(key, window);
    if (window.count >= 10) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - current) / 1000))
      };
    }
    window.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

interface Attempt {
  failures: number;
  resetAt: number;
}

export class LoginRateLimiter {
  private readonly attempts = new Map<string, Attempt>();

  public constructor(
    private readonly hashKey: Buffer,
    private readonly now: () => number = Date.now
  ) {}

  public key(ip: string, tenant: string, username: string): string {
    return keyedHash(this.hashKey, `${ip}\0${tenant}\0${username}`);
  }

  public check(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const attempt = this.attempts.get(key);
    if (!attempt || attempt.resetAt <= this.now()) {
      this.attempts.delete(key);
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (attempt.failures < 5) return { allowed: true, retryAfterSeconds: 0 };
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((attempt.resetAt - this.now()) / 1000))
    };
  }

  public failure(key: string): number {
    const current = this.attempts.get(key);
    const failures = (current?.resetAt ?? 0) > this.now() ? (current?.failures ?? 0) + 1 : 1;
    this.attempts.set(key, { failures, resetAt: this.now() + 15 * 60 * 1000 });
    return Math.min(800, 100 * 2 ** Math.max(0, failures - 1));
  }

  public success(key: string): void {
    this.attempts.delete(key);
  }
}
