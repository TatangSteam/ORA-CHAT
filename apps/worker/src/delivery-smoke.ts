import { createDatabaseClient } from '@raho/db';

import { deliverOutbox } from './outbox.js';

const prisma = createDatabaseClient();
try {
  const outbox = await prisma.outboxMessage.findFirstOrThrow({
    where: { status: 'queued', message: { source: 'ai' } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, tenantId: true }
  });
  await prisma.whatsAppSessionState.update({
    where: { tenantId: outbox.tenantId },
    data: { state: 'connected', revision: { increment: 1 } }
  });
  const result = await deliverOutbox(
    prisma,
    { send: async () => ({ providerMessageId: `smoke-${outbox.id}` }) },
    { kind: 'outbound.delivery', tenantId: outbox.tenantId, outboxMessageId: outbox.id },
    'phase2-smoke'
  );
  if (result.status !== 'delivered') throw new Error('Mock provider delivery did not complete');
  process.stdout.write(`${JSON.stringify({ ...result, status: 'passed' })}\n`);
} finally {
  await prisma.$disconnect();
}
