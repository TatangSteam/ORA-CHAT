export interface EphemeralQr {
  qr: string;
  expiresAt: Date;
}

export class EphemeralQrStore {
  private readonly entries = new Map<string, EphemeralQr>();

  public constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly ttlMs = 60_000
  ) {}

  public put(tenantId: string, qr: string): EphemeralQr {
    const entry = { qr, expiresAt: new Date(this.now().getTime() + this.ttlMs) };
    this.entries.set(tenantId, entry);
    return entry;
  }

  public get(tenantId: string): EphemeralQr | null {
    const entry = this.entries.get(tenantId);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(tenantId);
      return null;
    }
    return entry;
  }

  public clear(tenantId: string): void {
    this.entries.delete(tenantId);
  }
}
