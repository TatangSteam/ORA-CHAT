import { QueueEvents } from 'bullmq';

import { createQueueConnection, queuePrefix } from './connection.js';
import { createSystemQueue, enqueueSystemProbe, systemQueueName } from './queue.js';

const producerConnection = createQueueConnection('producer');
const eventsConnection = createQueueConnection('worker');
const queue = createSystemQueue(producerConnection);
const events = new QueueEvents(systemQueueName, {
  connection: eventsConnection,
  prefix: queuePrefix()
});

try {
  await Promise.all([queue.waitUntilReady(), events.waitUntilReady()]);
  const probeId = `runtime-${Date.now()}`;
  const first = await enqueueSystemProbe(queue, probeId);
  const duplicate = await enqueueSystemProbe(queue, probeId);
  if (first.id !== duplicate.id) throw new Error('Deterministic job ID was not reused');
  const result = (await first.waitUntilFinished(events, 10_000)) as {
    status?: string;
    probeId?: string;
  };
  if (result.status !== 'processed' || result.probeId !== probeId) {
    throw new Error('Worker returned an invalid probe result');
  }
  process.stdout.write(`${JSON.stringify({ deterministicId: true, status: 'passed' })}\n`);
} finally {
  await Promise.all([events.close(), queue.close()]);
  await Promise.all([eventsConnection.quit(), producerConnection.quit()]);
}
