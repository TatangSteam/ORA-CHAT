export { createDatabaseClient, databaseConnectionString } from './prisma.js';
export {
  credentialFingerprintMatches,
  openCredential,
  readAiMasterKey,
  sealCredential,
  type CredentialContext,
  type CredentialEnvelope
} from './credential-envelope.js';
export { hashPassword, verifyPassword, passwordPolicy } from './password.js';
export { generateUuidV7 } from './uuid-v7.js';
export { hashOpaqueValue, newOpaqueToken } from './secrets.js';
export { Prisma, PrismaClient } from './generated/prisma/client.js';

export const databaseStack = {
  engine: 'postgresql',
  orm: 'prisma',
  vectorExtension: 'pgvector'
} as const;
