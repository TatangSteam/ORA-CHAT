import { describe, expect, it } from 'vitest';

import { deterministicJobId, queueJobSchema } from './jobs.js';

describe('queue job contract', () => {
  it('builds stable IDs without BullMQ-reserved separators', () => {
    const first = deterministicJobId('system.probe', 'system', 'startup-1');
    const second = deterministicJobId('system.probe', 'system', 'startup-1');
    expect(first).toBe(second);
    expect(first).toMatch(/^system-probe-[a-f0-9]{64}$/u);
    expect(first).not.toContain(':');
  });

  it('rejects payload fields outside the durable identifier contract', () => {
    expect(
      queueJobSchema.safeParse({
        kind: 'outbound.delivery',
        tenantId: '01988c36-6880-7000-8000-000000000001',
        outboxMessageId: '01988c36-6880-7000-8000-000000000002',
        messageBody: 'must not enter Redis'
      }).success
    ).toBe(false);
  });

  it('accepts only durable document and reindex identifiers', () => {
    expect(
      queueJobSchema.safeParse({
        kind: 'knowledge.document.process',
        tenantId: '01988c36-6880-7000-8000-000000000001',
        documentId: '01988c36-6880-7000-8000-000000000003'
      }).success
    ).toBe(true);
    expect(
      queueJobSchema.safeParse({
        kind: 'knowledge.reindex',
        tenantId: '01988c36-6880-7000-8000-000000000001',
        generation: 4,
        content: 'must never enter Redis'
      }).success
    ).toBe(false);
  });
});
