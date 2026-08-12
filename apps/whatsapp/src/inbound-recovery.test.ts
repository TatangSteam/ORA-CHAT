import type { WAMessage } from 'baileys';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InboundRecoveryQueue, type PlaceholderResender } from './inbound-recovery.js';

const unavailableMessage = (): WAMessage => ({
  key: {
    id: 'provider-message-1',
    remoteJid: '123456789012345@lid',
    remoteJidAlt: '6281234567890@s.whatsapp.net',
    fromMe: false
  },
  message: null,
  messageTimestamp: 1_786_435_200,
  pushName: 'Customer'
});

afterEach(() => {
  vi.useRealTimers();
});

describe('InboundRecoveryQueue', () => {
  it('retries an unavailable message with bounded backoff', async () => {
    vi.useFakeTimers();
    const requestPlaceholderResend = vi.fn(async () => 'request-id');
    const events: string[] = [];
    const queue = new InboundRecoveryQueue(
      () => ({ requestPlaceholderResend }),
      [10, 20, 30],
      (event, attempt) => events.push(`${event}:${attempt}`)
    );

    expect(queue.enqueue(unavailableMessage())).toBe(true);
    expect(queue.enqueue(unavailableMessage())).toBe(false);

    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(20);
    await vi.advanceTimersByTimeAsync(30);

    expect(requestPlaceholderResend).toHaveBeenCalledTimes(3);
    expect(requestPlaceholderResend).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'provider-message-1', fromMe: false }),
      expect.objectContaining({ pushName: 'Customer' })
    );
    expect(events).toEqual(['requested:1', 'requested:2', 'requested:3', 'exhausted:3']);
    expect(queue.pendingCount()).toBe(0);
  });

  it('cancels pending retries when recovered content arrives', async () => {
    vi.useFakeTimers();
    const requestPlaceholderResend = vi.fn(async () => 'request-id');
    const queue = new InboundRecoveryQueue(() => ({ requestPlaceholderResend }), [10]);

    queue.enqueue(unavailableMessage());
    expect(queue.resolve('provider-message-1')).toBe(true);
    await vi.runAllTimersAsync();

    expect(requestPlaceholderResend).not.toHaveBeenCalled();
    expect(queue.pendingCount()).toBe(0);
  });

  it('pauses retries while the socket is disconnected and resumes on reconnect', async () => {
    vi.useFakeTimers();
    const requestPlaceholderResend = vi.fn(async () => 'request-id');
    let resender: PlaceholderResender | undefined = { requestPlaceholderResend };
    const queue = new InboundRecoveryQueue(() => resender, [10]);

    queue.enqueue(unavailableMessage());
    queue.pause();
    resender = undefined;
    await vi.advanceTimersByTimeAsync(20);
    expect(requestPlaceholderResend).not.toHaveBeenCalled();

    resender = { requestPlaceholderResend };
    queue.resume();
    await vi.advanceTimersByTimeAsync(10);
    expect(requestPlaceholderResend).toHaveBeenCalledOnce();
  });
});
