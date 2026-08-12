import { readFileSync } from 'node:fs';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.js';

const readSecretFile = (path: string): string => readFileSync(path, 'utf8').trim();

export const databaseConnectionString = (): string => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const passwordFile = process.env.POSTGRES_PASSWORD_FILE;
  if (!passwordFile) {
    throw new Error('DATABASE_URL or POSTGRES_PASSWORD_FILE is required');
  }

  const user = encodeURIComponent(process.env.POSTGRES_USER ?? 'raho_app');
  const password = encodeURIComponent(readSecretFile(passwordFile));
  const host = process.env.POSTGRES_HOST ?? 'postgres';
  const port = process.env.POSTGRES_PORT ?? '5432';
  const database = encodeURIComponent(process.env.POSTGRES_DB ?? 'raho_chatbot');
  return `postgresql://${user}:${password}@${host}:${port}/${database}?schema=public`;
};

export const createDatabaseClient = (connectionString = databaseConnectionString()) => {
  const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    max: 10
  });
  return new PrismaClient({ adapter });
};
