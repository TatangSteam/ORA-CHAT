import type { OutboundDeliveryJob, QueueJob } from '@raho/queue';

export interface QueueJobEnvelope {
  data: QueueJob;
}

export interface SafetyReadRepository {
  getSafetyState(tenantId: string): Promise<{
    sendingPaused: boolean;
    killSwitch: boolean;
    revision: number;
  }>;
}

export type DeliveryExecutor = (
  job: OutboundDeliveryJob
) => Promise<
  | { status: 'noop' }
  | { status: 'delivered'; providerMessageId: string }
  | { status: 'deferred'; reason: string }
  | { status: 'failed'; reason: string }
  | { status: 'unknown' }
>;

export type WorkerResult =
  | { status: 'processed'; probeId: string }
  | { status: 'blocked'; reason: 'safety_state'; revision: number }
  | Awaited<ReturnType<DeliveryExecutor>>;

export type KnowledgeExecutor = (
  job: Extract<QueueJob, { kind: 'knowledge.document.process' | 'knowledge.reindex' }>
) => Promise<unknown>;

export const createSafetyGatedProcessor =
  (safety: SafetyReadRepository, deliver: DeliveryExecutor, knowledge?: KnowledgeExecutor) =>
  async (job: QueueJobEnvelope): Promise<WorkerResult> => {
    if (job.data.kind === 'system.probe') {
      return { status: 'processed', probeId: job.data.probeId };
    }

    if (job.data.kind === 'knowledge.document.process' || job.data.kind === 'knowledge.reindex') {
      if (!knowledge) throw new Error('KNOWLEDGE_PROCESSOR_UNAVAILABLE');
      return (await knowledge(job.data)) as WorkerResult;
    }

    const state = await safety.getSafetyState(job.data.tenantId);
    if (state.sendingPaused || state.killSwitch) {
      return { status: 'blocked', reason: 'safety_state', revision: state.revision };
    }
    return deliver(job.data);
  };
