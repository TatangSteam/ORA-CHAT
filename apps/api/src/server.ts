import { createServer } from 'node:http';
import { apiPort } from '@raho/config';
import { normalizeIndonesianPhone } from '@raho/contracts';
import { createDatabaseClient, readAiMasterKey } from '@raho/db';
import {
  createQueueConnection,
  createSystemQueue,
  enqueueKnowledgeDocument,
  enqueueKnowledgeReindex,
  enqueueOutboundDelivery
} from '@raho/queue';
import { createStorageClient, probeStorageBuckets, readStorageConfig } from '@raho/storage';
import { createApp } from './app.js';
import { PrismaAiRepository } from './ai-repository.js';
import { PrismaAiOperationsRepository } from './ai-operations-repository.js';
import { PinnedSafeHttpTransport } from './ai-provider.js';
import { PrismaMessagingRepository } from './messaging-repository.js';
import { PrismaKnowledgeRepository } from './knowledge-repository.js';
import { PrismaTemplateRepository } from './template-repository.js';
import { PrismaApiRepository } from './repository.js';
import { InternalWhatsAppQrProvider } from './whatsapp.js';

const prisma = createDatabaseClient();
const storageConfig = readStorageConfig();
const storage = createStorageClient(storageConfig);
const redis = createQueueConnection('producer');
const queue = createSystemQueue(redis);
const masterKey = readAiMasterKey();
const transport = new PinnedSafeHttpTransport({
  privateHostAllowlist: (process.env.AI_PRIVATE_HOST_ALLOWLIST ?? '').split(',').filter(Boolean),
  allowedPrivatePorts: (process.env.AI_PRIVATE_PORT_ALLOWLIST ?? '')
    .split(',')
    .map(Number)
    .filter(Number.isInteger)
});
const whatsapp = new InternalWhatsAppQrProvider();
const configuredCsNotificationPhone = process.env.CS_WHATSAPP_NOTIFICATION_PHONE?.trim();
const csNotificationPhone = configuredCsNotificationPhone
  ? normalizeIndonesianPhone(configuredCsNotificationPhone)
  : undefined;
const server = createServer(
  createApp({
    repository: new PrismaApiRepository(prisma),
    messagingRepository: new PrismaMessagingRepository(prisma),
    aiRepository: new PrismaAiRepository(prisma, masterKey, transport),
    aiOperationsRepository: new PrismaAiOperationsRepository(prisma),
    knowledgeRepository: new PrismaKnowledgeRepository(prisma, masterKey, transport),
    templateRepository: new PrismaTemplateRepository(prisma),
    knowledgeStorage: { client: storage, config: storageConfig },
    knowledgeEnqueuer: {
      document: async (tenantId, documentId) => {
        await enqueueKnowledgeDocument(queue, tenantId, documentId);
      },
      reindex: async (tenantId) => {
        await enqueueKnowledgeReindex(queue, tenantId);
      }
    },
    outboxEnqueuer: {
      enqueue: async (tenantId, outboxMessageId, availableAt) => {
        await enqueueOutboundDelivery(
          queue,
          tenantId,
          outboxMessageId,
          Math.max(0, (availableAt?.getTime() ?? Date.now()) - Date.now())
        );
      }
    },
    qrProvider: whatsapp,
    whatsappSessionController: whatsapp,
    ...(csNotificationPhone ? { csNotificationPhone } : {}),
    storageProbe: () => probeStorageBuckets(storage, storageConfig.buckets)
  })
);

server.listen(apiPort, '0.0.0.0', () => {
  process.stdout.write(`RAHO API listening on port ${apiPort}\n`);
});

const shutdown = (signal: string) => {
  process.stdout.write(`RAHO API received ${signal}\n`);
  server.close(async (error) => {
    await queue.close();
    await redis.quit();
    await prisma.$disconnect();
    process.exitCode = error ? 1 : 0;
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
