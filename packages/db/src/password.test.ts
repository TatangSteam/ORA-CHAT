import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('stores a versioned scrypt hash and verifies without plaintext', async () => {
    const password = 'correct horse battery staple';
    const encoded = await hashPassword(password);

    expect(encoded).toMatch(/^scrypt\$v=1\$N=131072,r=8,p=1\$/u);
    expect(encoded).not.toContain(password);
    await expect(verifyPassword(password, encoded)).resolves.toBe(true);
    await expect(verifyPassword('wrong password value', encoded)).resolves.toBe(false);
  });
});
