import { readFileSync } from 'node:fs';
import { connect } from 'node:net';

import type { DependencyStatus } from './types.js';
import type { ApiRepository } from './repository.js';

const timeoutMs = 1_500;
export type StorageProbe = () => Promise<void>;

const httpProbe = async (
  name: DependencyStatus['name'],
  url: string
): Promise<DependencyStatus> => {
  const started = performance.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return {
      name,
      status: response.ok ? 'healthy' : 'degraded',
      latencyMs: Math.round(performance.now() - started)
    };
  } catch {
    return { name, status: 'unavailable', latencyMs: null };
  }
};

const tcpProbe = async (
  name: DependencyStatus['name'],
  host: string,
  port: number
): Promise<DependencyStatus> => {
  const started = performance.now();
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const finish = (status: DependencyStatus['status']) => {
      socket.destroy();
      resolve({
        name,
        status,
        latencyMs: status === 'healthy' ? Math.round(performance.now() - started) : null
      });
    };
    socket.setTimeout(timeoutMs, () => finish('unavailable'));
    socket.once('connect', () => finish('healthy'));
    socket.once('error', () => finish('unavailable'));
  });
};

const redisProbe = async (): Promise<DependencyStatus> => {
  const passwordFile = process.env.REDIS_PASSWORD_FILE;
  if (!passwordFile) return tcpProbe('redis', process.env.REDIS_HOST ?? 'redis', 6379);
  const password = readFileSync(passwordFile, 'utf8').trim();
  const started = performance.now();
  return new Promise((resolve) => {
    const socket = connect({ host: process.env.REDIS_HOST ?? 'redis', port: 6379 });
    let reply = '';
    let complete = false;
    const finish = (status: DependencyStatus['status']) => {
      if (complete) return;
      complete = true;
      socket.destroy();
      resolve({
        name: 'redis',
        status,
        latencyMs: status === 'healthy' ? Math.round(performance.now() - started) : null
      });
    };
    socket.setTimeout(timeoutMs, () => finish('unavailable'));
    socket.once('error', () => finish('unavailable'));
    socket.once('connect', () => {
      const command = `*2\r\n$4\r\nAUTH\r\n$${Buffer.byteLength(password)}\r\n${password}\r\n*1\r\n$4\r\nPING\r\n`;
      socket.write(command);
    });
    socket.on('data', (chunk) => {
      reply += chunk.toString('utf8');
      if (reply.includes('+PONG\r\n')) finish(reply.includes('+OK\r\n') ? 'healthy' : 'degraded');
      if (reply.includes('-ERR') || reply.includes('-WRONGPASS')) finish('unavailable');
    });
  });
};

export const dependencyStatuses = async (
  repository: ApiRepository,
  storageProbe?: StorageProbe
): Promise<DependencyStatus[]> => {
  const started = performance.now();
  const database = repository
    .ping()
    .then<DependencyStatus>(() => ({
      name: 'database',
      status: 'healthy',
      latencyMs: Math.round(performance.now() - started)
    }))
    .catch<DependencyStatus>(() => ({ name: 'database', status: 'unavailable', latencyMs: null }));

  const minio = storageProbe
    ? (() => {
        const storageStarted = performance.now();
        return storageProbe()
          .then<DependencyStatus>(() => ({
            name: 'minio',
            status: 'healthy',
            latencyMs: Math.round(performance.now() - storageStarted)
          }))
          .catch<DependencyStatus>(() => ({
            name: 'minio',
            status: 'unavailable',
            latencyMs: null
          }));
      })()
    : httpProbe('minio', process.env.MINIO_HEALTH_URL ?? 'http://minio:9000/minio/health/ready');

  return Promise.all([
    database,
    redisProbe(),
    httpProbe('worker', process.env.WORKER_HEALTH_URL ?? 'http://worker:4010/health/live'),
    minio,
    httpProbe('whatsapp', process.env.WHATSAPP_HEALTH_URL ?? 'http://whatsapp:4020/health/ready'),
    Promise.resolve<DependencyStatus>({
      name: 'chat_provider',
      status: 'not_configured',
      latencyMs: null
    }),
    Promise.resolve<DependencyStatus>({
      name: 'embedding_provider',
      status: 'not_configured',
      latencyMs: null
    })
  ]);
};
