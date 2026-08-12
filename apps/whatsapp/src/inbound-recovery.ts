import type { WAMessage, WAMessageKey } from 'baileys';

export interface PlaceholderResender {
  requestPlaceholderResend(
    messageKey: WAMessageKey,
    messageData?: Partial<WAMessage>
  ): Promise<string | undefined>;
}

export type InboundRecoveryEvent = 'requested' | 'request_failed' | 'exhausted';

interface PendingRecovery {
  message: WAMessage;
  attempt: number;
  timer?: ReturnType<typeof setTimeout>;
}

const defaultRetryDelaysMs = [12_000, 30_000, 60_000] as const;

/**
 * Baileys requests one placeholder resend when WhatsApp supplies a message without
 * encrypted content. If the primary phone does not answer that request, Baileys
 * clears its placeholder cache after eight seconds. This queue performs a small,
 * bounded number of later retries without retaining message content permanently.
 */
export class InboundRecoveryQueue {
  private readonly pending = new Map<string, PendingRecovery>();
  private paused = false;

  public constructor(
    private readonly getResender: () => PlaceholderResender | undefined,
    private readonly retryDelaysMs: readonly number[] = defaultRetryDelaysMs,
    private readonly onEvent: (event: InboundRecoveryEvent, attempt: number) => void = () => {}
  ) {}

  public enqueue(message: WAMessage): boolean {
    const messageId = message.key.id;
    if (!messageId || this.pending.has(messageId) || this.retryDelaysMs.length === 0) return false;
    this.pending.set(messageId, { message, attempt: 0 });
    this.schedule(messageId);
    return true;
  }

  public resolve(messageId: string): boolean {
    const recovery = this.pending.get(messageId);
    if (!recovery) return false;
    if (recovery.timer) clearTimeout(recovery.timer);
    this.pending.delete(messageId);
    return true;
  }

  public pause(): void {
    this.paused = true;
    for (const recovery of this.pending.values()) {
      if (recovery.timer) clearTimeout(recovery.timer);
      delete recovery.timer;
    }
  }

  public resume(): void {
    if (!this.paused) return;
    this.paused = false;
    for (const messageId of this.pending.keys()) this.schedule(messageId);
  }

  public clear(): void {
    for (const recovery of this.pending.values()) {
      if (recovery.timer) clearTimeout(recovery.timer);
    }
    this.pending.clear();
  }

  public pendingCount(): number {
    return this.pending.size;
  }

  private schedule(messageId: string): void {
    const recovery = this.pending.get(messageId);
    if (!recovery || recovery.timer || this.paused) return;
    const delayMs = this.retryDelaysMs[recovery.attempt];
    if (delayMs === undefined) {
      this.pending.delete(messageId);
      this.onEvent('exhausted', recovery.attempt);
      return;
    }
    recovery.timer = setTimeout(() => void this.retry(messageId), delayMs);
  }

  private async retry(messageId: string): Promise<void> {
    const recovery = this.pending.get(messageId);
    if (!recovery) return;
    delete recovery.timer;
    if (this.paused) return;

    const resender = this.getResender();
    if (!resender) {
      this.schedule(messageId);
      return;
    }

    const { key, messageTimestamp, participant, pushName, verifiedBizName } = recovery.message;
    const cleanKey: WAMessageKey = {
      ...(key.remoteJid !== undefined ? { remoteJid: key.remoteJid } : {}),
      ...(key.fromMe !== undefined ? { fromMe: key.fromMe } : {}),
      ...(key.id !== undefined ? { id: key.id } : {}),
      ...(key.participant !== undefined ? { participant: key.participant } : {})
    };
    const messageData: Partial<WAMessage> = {
      key,
      ...(messageTimestamp !== undefined ? { messageTimestamp } : {}),
      ...(participant !== undefined ? { participant } : {}),
      ...(pushName !== undefined ? { pushName } : {}),
      ...(verifiedBizName !== undefined ? { verifiedBizName } : {})
    };
    const attempt = recovery.attempt + 1;
    try {
      await resender.requestPlaceholderResend(cleanKey, messageData);
      this.onEvent('requested', attempt);
    } catch {
      this.onEvent('request_failed', attempt);
    }
    recovery.attempt = attempt;
    this.schedule(messageId);
  }
}
