import { describe, expect, it, vi } from 'vitest';

import { createSafetyGatedProcessor } from './processor.js';

const delivery = {
  kind: 'outbound.delivery',
  tenantId: '01988c36-6880-7000-8000-000000000001',
  outboxMessageId: '01988c36-6880-7000-8000-000000000002'
} as const;

describe('worker safety gate', () => {
  it.each([
    { sendingPaused: true, killSwitch: false },
    { sendingPaused: false, killSwitch: true }
  ])('never calls delivery while safety blocks sending', async (state) => {
    const deliver = vi.fn();
    const processor = createSafetyGatedProcessor(
      { getSafetyState: async () => ({ ...state, revision: 4 }) },
      deliver
    );

    await expect(processor({ data: delivery })).resolves.toEqual({
      status: 'blocked',
      reason: 'safety_state',
      revision: 4
    });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('delegates only when pause and kill switch are both clear', async () => {
    const deliver = vi.fn(async () => ({
      status: 'delivered' as const,
      providerMessageId: 'safe'
    }));
    const processor = createSafetyGatedProcessor(
      {
        getSafetyState: async () => ({ sendingPaused: false, killSwitch: false, revision: 2 })
      },
      deliver
    );
    await expect(processor({ data: delivery })).resolves.toEqual({
      status: 'delivered',
      providerMessageId: 'safe'
    });
    expect(deliver).toHaveBeenCalledOnce();
  });

  it('routes knowledge work independently from outbound safety state', async () => {
    const safety = {
      getSafetyState: vi.fn(async () => ({ sendingPaused: true, killSwitch: true, revision: 9 }))
    };
    const deliver = vi.fn();
    const knowledge = vi.fn(async () => ({ status: 'indexed' }));
    const processor = createSafetyGatedProcessor(safety, deliver, knowledge);
    await expect(
      processor({
        data: {
          kind: 'knowledge.reindex',
          tenantId: '01988c36-6880-7000-8000-000000000001',
          generation: 1
        }
      })
    ).resolves.toEqual({ status: 'indexed' });
    expect(safety.getSafetyState).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });
});
