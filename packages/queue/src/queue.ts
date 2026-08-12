import { Queue, Worker, type Job, type Processor } from 'bullmq';
import type { Redis } from 'ioredis';

import { queueJobSchema, type QueueJob, type SystemProbeJob } from './jobs.js';
import { queuePrefix } from './connection.js';
import { deterministicJobId } from './jobs.js';

export const systemQueueName = 'system';

export const createSystemQueue = (
  connection: Redis,
  environment = process.env.RAHO_ENVIRONMENT ?? 'local'
): Queue<QueueJob> =>
  new Queue<QueueJob>(systemQueueName, {
    connection,
    prefix: queuePrefix(environment),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: { age: 3_600, count: 1_000 },
      removeOnFail: { age: 86_400, count: 5_000 }
    }
  });

export const enqueueSystemProbe = async (
  queue: Queue<QueueJob>,
  probeId: string,
  now = new Date()
) => {
  const data: SystemProbeJob = {
    kind: 'system.probe',
    probeId,
    enqueuedAt: now.toISOString()
  };
  return queue.add(data.kind, data, {
    jobId: deterministicJobId(data.kind, 'system', probeId)
  });
};

export const enqueueOutboundDelivery = async (
  queue: Queue<QueueJob>,
  tenantId: string,
  outboxMessageId: string,
  delay = 0
) => {
  const data = queueJobSchema.parse({
    kind: 'outbound.delivery',
    tenantId,
    outboxMessageId
  });
  return queue.add(data.kind, data, {
    jobId: deterministicJobId(data.kind, tenantId, outboxMessageId),
    delay,
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true
  });
};

export const enqueueKnowledgeDocument = async (
  queue: Queue<QueueJob>,
  tenantId: string,
  documentId: string
) => {
  const data = queueJobSchema.parse({
    kind: 'knowledge.document.process',
    tenantId,
    documentId
  });
  return queue.add(data.kind, data, {
    jobId: deterministicJobId(data.kind, tenantId, documentId),
    attempts: 3,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: true,
    removeOnFail: true
  });
};

export const enqueueKnowledgeReindex = async (
  queue: Queue<QueueJob>,
  tenantId: string,
  generation = Date.now()
) => {
  const data = queueJobSchema.parse({ kind: 'knowledge.reindex', tenantId, generation });
  return queue.add(data.kind, data, {
    jobId: deterministicJobId(data.kind, tenantId, String(generation)),
    attempts: 2,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: true,
    removeOnFail: true
  });
};

export const createSystemWorker = <Result>(
  connection: Redis,
  processor: (job: Job<QueueJob>) => Promise<Result>,
  environment = process.env.RAHO_ENVIRONMENT ?? 'local'
): Worker<QueueJob, Result> => {
  const validatedProcessor: Processor<QueueJob, Result> = async (job) => {
    job.data = queueJobSchema.parse(job.data);
    return processor(job);
  };
  return new Worker<QueueJob, Result>(systemQueueName, validatedProcessor, {
    connection,
    prefix: queuePrefix(environment),
    concurrency: 4,
    autorun: true
  });
};
