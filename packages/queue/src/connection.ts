import { readFileSync } from 'node:fs';

import { Redis } from 'ioredis';

export type QueueConnectionKind = 'producer' | 'worker';

export interface QueueConnectionConfig {
  host: string;
  port: number;
  password: string;
  environment: string;
}

export const queuePrefix = (environment = process.env.RAHO_ENVIRONMENT ?? 'local'): string =>
  `raho:v2:${environment}`;

export const readQueueConnectionConfig = (): QueueConnectionConfig => {
  const passwordFile = process.env.REDIS_PASSWORD_FILE;
  if (!passwordFile) throw new Error('REDIS_PASSWORD_FILE is required');
  const password = readFileSync(passwordFile, 'utf8').trim();
  if (!password) throw new Error('Redis password file must not be empty');
  const port = Number(process.env.REDIS_PORT ?? 6379);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('REDIS_PORT must be an integer between 1 and 65535');
  }
  return {
    host: process.env.REDIS_HOST ?? 'redis',
    port,
    password,
    environment: process.env.RAHO_ENVIRONMENT ?? 'local'
  };
};

export const createQueueConnection = (
  kind: QueueConnectionKind,
  config = readQueueConnectionConfig()
): Redis =>
  new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    connectionName: `raho-${kind}`,
    enableReadyCheck: true,
    lazyConnect: true,
    maxRetriesPerRequest: kind === 'worker' ? null : 1
  });
