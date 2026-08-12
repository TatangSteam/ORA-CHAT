import { describe, expect, it } from 'vitest';

import { TenantEventHub } from './event-hub.js';

describe('tenant SSE replay buffer', () => {
  it('replays only events after Last-Event-ID and never crosses tenants', () => {
    const hub = new TenantEventHub();
    const first = hub.publish('tenant-a', 'overview', { revision: 1 });
    hub.publish('tenant-b', 'overview', { revision: 99 });
    const second = hub.publish('tenant-a', 'overview', { revision: 2 });
    expect(hub.replay('tenant-a', first.id)).toEqual([second]);
    expect(hub.replay('tenant-b', first.id).map(({ data }) => data)).toEqual([{ revision: 99 }]);
  });

  it('expires old events and enforces its bounded buffer', () => {
    let now = new Date('2026-08-07T00:00:00.000Z');
    const hub = new TenantEventHub(2, 1_000, () => now);
    const first = hub.publish('tenant-a', 'overview', { revision: 1 });
    hub.publish('tenant-a', 'overview', { revision: 2 });
    hub.publish('tenant-a', 'overview', { revision: 3 });
    expect(hub.replay('tenant-a', first.id)).toHaveLength(2);
    now = new Date('2026-08-07T00:00:01.001Z');
    expect(hub.replay('tenant-a', first.id)).toEqual([]);
  });
});
