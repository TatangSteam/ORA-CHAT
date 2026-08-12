import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual
} from 'node:crypto';
import { readFileSync } from 'node:fs';

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export interface CredentialContext {
  tenantId: string;
  provider: string;
  purpose: string;
}

export interface CredentialEnvelope {
  encryptedCiphertext: Buffer;
  encryptedDataKey: Buffer;
  nonce: Buffer;
  encryptionAlgorithm: 'AES-256-GCM';
  masterKeyVersion: 'v1';
  secretFingerprint: string;
}

const aad = ({ tenantId, provider, purpose }: CredentialContext): Buffer =>
  Buffer.from(`raho-ai-credential:v1:${tenantId}:${provider}:${purpose}`, 'utf8');

const encrypt = (plaintext: Buffer, key: Buffer, nonce: Buffer, additionalData: Buffer): Buffer => {
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(additionalData);
  return Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
};

const decrypt = (ciphertextAndTag: Buffer, key: Buffer, nonce: Buffer, additionalData: Buffer) => {
  if (ciphertextAndTag.length <= TAG_BYTES) throw new Error('CREDENTIAL_ENVELOPE_INVALID');
  const ciphertext = ciphertextAndTag.subarray(0, -TAG_BYTES);
  const tag = ciphertextAndTag.subarray(-TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(additionalData);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};

export const readAiMasterKey = (): Buffer => {
  const path = process.env.AI_MASTER_KEY_FILE;
  if (!path) throw new Error('AI_MASTER_KEY_FILE is required');
  const encoded = readFileSync(path, 'utf8').trim();
  if (!/^[0-9a-f]{64}$/u.test(encoded)) throw new Error('AI master key must be 32-byte hex');
  return Buffer.from(encoded, 'hex');
};

export const sealCredential = (
  secret: string,
  context: CredentialContext,
  masterKey: Buffer
): CredentialEnvelope => {
  if (masterKey.length !== KEY_BYTES) throw new Error('AI master key must be 32 bytes');
  const dataKey = randomBytes(KEY_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  const keyNonce = randomBytes(NONCE_BYTES);
  const additionalData = aad(context);
  const encryptedCiphertext = encrypt(Buffer.from(secret, 'utf8'), dataKey, nonce, additionalData);
  const encryptedKeyBody = encrypt(dataKey, masterKey, keyNonce, additionalData);
  dataKey.fill(0);
  return {
    encryptedCiphertext,
    encryptedDataKey: Buffer.concat([keyNonce, encryptedKeyBody]),
    nonce,
    encryptionAlgorithm: 'AES-256-GCM',
    masterKeyVersion: 'v1',
    secretFingerprint: createHmac('sha256', masterKey)
      .update(additionalData)
      .update(secret, 'utf8')
      .digest('hex')
      .slice(0, 16)
  };
};

export const openCredential = (
  envelope: Pick<
    CredentialEnvelope,
    | 'encryptedCiphertext'
    | 'encryptedDataKey'
    | 'nonce'
    | 'encryptionAlgorithm'
    | 'masterKeyVersion'
  >,
  context: CredentialContext,
  masterKey: Buffer
): string => {
  if (
    envelope.encryptionAlgorithm !== 'AES-256-GCM' ||
    envelope.masterKeyVersion !== 'v1' ||
    masterKey.length !== KEY_BYTES ||
    envelope.encryptedDataKey.length <= NONCE_BYTES + TAG_BYTES
  ) {
    throw new Error('CREDENTIAL_ENVELOPE_INVALID');
  }
  const additionalData = aad(context);
  const keyNonce = envelope.encryptedDataKey.subarray(0, NONCE_BYTES);
  const wrappedKey = envelope.encryptedDataKey.subarray(NONCE_BYTES);
  const dataKey = decrypt(wrappedKey, masterKey, keyNonce, additionalData);
  try {
    return decrypt(envelope.encryptedCiphertext, dataKey, envelope.nonce, additionalData).toString(
      'utf8'
    );
  } finally {
    dataKey.fill(0);
  }
};

export const credentialFingerprintMatches = (
  candidate: string,
  expected: string,
  context: CredentialContext,
  masterKey: Buffer
): boolean => {
  const actual = sealCredential(candidate, context, masterKey).secretFingerprint;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
};
