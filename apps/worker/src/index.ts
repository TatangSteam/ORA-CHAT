import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';

import { serviceNameSchema } from '@raho/contracts';
import { createDatabaseClient, readAiMasterKey } from '@raho/db';
import {
  createQueueConnection,
  createSystemQueue,
  createSystemWorker,
  enqueueOutboundDelivery
} from '@raho/queue';
import { createStorageClient, probeStorageBuckets, readStorageConfig } from '@raho/storage';

import { createWorkerHealthServer, parseWorkerHealthPort } from './health.js';
import { createSafetyGatedProcessor } from './processor.js';
import { KnowledgeWorker } from './knowledge.js';
import {
  deliverOutbox,
  dispatchDueOutbox,
  InternalWhatsAppDelivery,
  OUTBOX_DISPATCH_INTERVAL_MS,
  OUTBOX_RECOVERY_INTERVAL_MS,
  recoverExpiredOutbox
} from './outbox.js';
import {
  purgeExpiredIdempotencyKeys,
  purgeRetainedSessions,
  type IdempotencyRetentionRepository,
  SESSION_RETENTION_INTERVAL_MS,
  type SessionRetentionRepository
} from './retention.js';

export const workerServiceName = serviceNameSchema.parse('worker');

const entryPath = process.argv[1] ? resolve(process.argv[1]) : undefined;

if (entryPath === fileURLToPath(import.meta.url)) {
  let ready = false;
  const prisma = createDatabaseClient();
  const storageConfig = readStorageConfig();
  const storage = createStorageClient(storageConfig);
  const redis = createQueueConnection('worker');
  const producerRedis = createQueueConnection('producer');
  const queue = createSystemQueue(producerRedis);
  const knowledge = new KnowledgeWorker(prisma, storage, storageConfig, readAiMasterKey());
  redis.on('error', () => {
    ready = false;
  });
  const processor = createSafetyGatedProcessor(
    {
      getSafetyState: async (tenantId) => {
        const state = await prisma.safetyControlState.findUniqueOrThrow({ where: { tenantId } });
        return state;
      }
    },
    (job) =>
      deliverOutbox(prisma, new InternalWhatsAppDelivery(), job, `${hostname()}:${process.pid}`),
    (job) =>
      job.kind === 'knowledge.document.process'
        ? knowledge.processDocument(job.tenantId, job.documentId)
        : knowledge.reindex(job.tenantId)
  );
  const queueWorker = createSystemWorker(redis, processor);
  queueWorker.on('error', () => {
    ready = false;
  });
  const server = createWorkerHealthServer(() => ready);
  const port = parseWorkerHealthPort(process.env.WORKER_HEALTH_PORT);
  server.listen(port, '0.0.0.0', () => {
    process.stdout.write(`RAHO worker health listening on port ${port}\n`);
  });

  await Promise.all([
    queueWorker.waitUntilReady(),
    prisma.$queryRaw`SELECT 1`,
    probeStorageBuckets(storage, storageConfig.buckets)
  ]);
  const retentionRepository: SessionRetentionRepository = {
    deleteRetainedSessions: async (cutoff) => {
      const result = await prisma.adminSession.deleteMany({
        where: {
          OR: [{ revokedAt: { lt: cutoff } }, { expiresAt: { lt: cutoff } }]
        }
      });
      return result.count;
    }
  };
  const idempotencyRetentionRepository: IdempotencyRetentionRepository = {
    deleteExpiredIdempotencyKeys: async (now) => {
      const result = await prisma.idempotencyKey.deleteMany({
        where: { expiresAt: { lt: now } }
      });
      return result.count;
    }
  };
  const runRetention = async () => {
    try {
      const now = new Date();
      const [sessions, idempotency] = await Promise.all([
        purgeRetainedSessions(retentionRepository, now),
        purgeExpiredIdempotencyKeys(idempotencyRetentionRepository, now)
      ]);
      if (sessions.deleted > 0) {
        process.stdout.write(`RAHO worker purged ${sessions.deleted} retained sessions\n`);
      }
      if (idempotency.deleted > 0) {
        process.stdout.write(
          `RAHO worker purged ${idempotency.deleted} expired idempotency keys\n`
        );
      }
    } catch {
      ready = false;
    }
  };
  await Promise.all([
    purgeRetainedSessions(retentionRepository, new Date()),
    purgeExpiredIdempotencyKeys(idempotencyRetentionRepository, new Date())
  ]);
  const retentionTimer = setInterval(() => void runRetention(), SESSION_RETENTION_INTERVAL_MS);
  retentionTimer.unref();
  const orphanTimer = setInterval(() => void knowledge.sweepOrphans(), 60 * 60 * 1_000);
  orphanTimer.unref();
  const enqueuer = {
    enqueue: async (tenantId: string, outboxMessageId: string, availableAt?: Date) => {
      await enqueueOutboundDelivery(
        queue,
        tenantId,
        outboxMessageId,
        Math.max(0, (availableAt?.getTime() ?? Date.now()) - Date.now())
      );
    }
  };
  const runDispatcher = async () => {
    try {
      await dispatchDueOutbox(prisma, enqueuer);
    } catch {
      ready = false;
    }
  };
  const runRecovery = async () => {
    try {
      await recoverExpiredOutbox(prisma);
    } catch {
      ready = false;
    }
  };
  await recoverExpiredOutbox(prisma);
  await dispatchDueOutbox(prisma, enqueuer);
  const dispatchTimer = setInterval(() => void runDispatcher(), OUTBOX_DISPATCH_INTERVAL_MS);
  const recoveryTimer = setInterval(() => void runRecovery(), OUTBOX_RECOVERY_INTERVAL_MS);
  dispatchTimer.unref();
  recoveryTimer.unref();
  ready = true;

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    ready = false;
    clearInterval(retentionTimer);
    clearInterval(orphanTimer);
    clearInterval(dispatchTimer);
    clearInterval(recoveryTimer);
    process.stdout.write(`RAHO worker received ${signal}\n`);
    await queueWorker.close();
    await queue.close();
    await redis.quit();
    await producerRedis.quit();
    await prisma.$disconnect();
    await new Promise<void>((resolveClose, rejectClose) =>
      server.close((error) => (error ? rejectClose(error) : resolveClose()))
    );
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}
