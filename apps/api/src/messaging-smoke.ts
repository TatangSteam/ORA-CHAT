import { createHash } from 'node:crypto';

import { createDatabaseClient } from '@raho/db';

import { PrismaMessagingRepository } from './messaging-repository.js';

const prisma = createDatabaseClient();
try {
  const membership = await prisma.adminTenantMembership.findFirstOrThrow({
    where: { tenant: { slug: 'default' }, role: 'super_admin' },
    select: { tenantId: true, adminUserId: true }
  });
  const contact = await prisma.contact.findFirstOrThrow({
    where: { tenantId: membership.tenantId },
    select: { id: true }
  });
  const key = `phase2-ai-${Date.now()}`;
  const content = 'Fixture jalur AI menuju durable outbox';
  const result = await new PrismaMessagingRepository(prisma).createOutbound({
    tenantId: membership.tenantId,
    actorUserId: membership.adminUserId,
    idempotencyKey: key,
    requestHash: createHash('sha256')
      .update(JSON.stringify({ contactId: contact.id, content }))
      .digest('hex'),
    contactId: contact.id,
    content,
    source: 'ai',
    requestId: key,
    now: new Date()
  });
  process.stdout.write(`${JSON.stringify({ ...result, source: 'ai', status: 'passed' })}\n`);
} finally {
  await prisma.$disconnect();
}
