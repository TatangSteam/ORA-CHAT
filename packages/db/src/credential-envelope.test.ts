import { describe, expect, it } from 'vitest';

import { openCredential, sealCredential } from './credential-envelope.js';

const key = Buffer.alloc(32, 7);
const context = { tenantId: 'tenant-a', provider: 'openai', purpose: 'chat' };

describe('AI credential envelope', () => {
  it('round-trips through a random data key without storing plaintext', () => {
    const envelope = sealCredential('sk-super-secret-value', context, key);
    expect(openCredential(envelope, context, key)).toBe('sk-super-secret-value');
    expect(
      Buffer.concat([envelope.encryptedCiphertext, envelope.encryptedDataKey]).toString()
    ).not.toContain('super-secret');
    expect(envelope.secretFingerprint).toMatch(/^[0-9a-f]{16}$/u);
  });

  it('binds ciphertext to tenant/provider/purpose and rejects tampering', () => {
    const envelope = sealCredential('gateway-secret', context, key);
    expect(() => openCredential(envelope, { ...context, tenantId: 'tenant-b' }, key)).toThrow();
    const tampered = Buffer.from(envelope.encryptedCiphertext);
    tampered[0] = tampered[0]! ^ 1;
    expect(() =>
      openCredential({ ...envelope, encryptedCiphertext: tampered }, context, key)
    ).toThrow();
  });
});
