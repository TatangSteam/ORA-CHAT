export interface TenantEvent<T = unknown> {
  id: string;
  event: string;
  data: T;
  createdAt: Date;
}

type Listener = (event: TenantEvent) => void;

export class TenantEventHub {
  private readonly buffers = new Map<string, TenantEvent[]>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private sequence = 0;

  public constructor(
    private readonly maxEvents = 100,
    private readonly ttlMs = 5 * 60_000,
    private readonly now: () => Date = () => new Date()
  ) {}

  public publish<T>(tenantId: string, event: string, data: T): TenantEvent<T> {
    const createdAt = this.now();
    this.sequence += 1;
    const entry: TenantEvent<T> = {
      id: `${createdAt.getTime()}-${this.sequence}`,
      event,
      data,
      createdAt
    };
    const fresh = this.freshEvents(tenantId);
    fresh.push(entry);
    if (fresh.length > this.maxEvents) fresh.splice(0, fresh.length - this.maxEvents);
    this.buffers.set(tenantId, fresh);
    for (const listener of this.listeners.get(tenantId) ?? []) listener(entry);
    return entry;
  }

  public replay(tenantId: string, lastEventId: string): TenantEvent[] {
    const events = this.freshEvents(tenantId);
    this.buffers.set(tenantId, events);
    const index = events.findIndex(({ id }) => id === lastEventId);
    return index >= 0 ? events.slice(index + 1) : events;
  }

  public subscribe(tenantId: string, listener: Listener): () => void {
    const tenantListeners = this.listeners.get(tenantId) ?? new Set<Listener>();
    tenantListeners.add(listener);
    this.listeners.set(tenantId, tenantListeners);
    return () => {
      tenantListeners.delete(listener);
      if (tenantListeners.size === 0) this.listeners.delete(tenantId);
    };
  }

  private freshEvents(tenantId: string): TenantEvent[] {
    const threshold = this.now().getTime() - this.ttlMs;
    return (this.buffers.get(tenantId) ?? []).filter(
      ({ createdAt }) => createdAt.getTime() > threshold
    );
  }
}

export const serializeSseEvent = (entry: TenantEvent): string =>
  `id: ${entry.id}\nevent: ${entry.event}\ndata: ${JSON.stringify(entry.data)}\n\n`;
