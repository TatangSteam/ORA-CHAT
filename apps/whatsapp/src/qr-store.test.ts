import { describe, expect, it } from 'vitest';

import { EphemeralQrStore } from './qr-store.js';

describe('ephemeral WhatsApp QR store', () => {
  it('keeps QR in memory only until its short TTL', () => {
    let now = new Date('2026-08-07T00:00:00.000Z');
    const store = new EphemeralQrStore(() => now, 60_000);
    store.put('01988c36-6880-7000-8000-000000000001', 'private-qr-value');
    expect(store.get('01988c36-6880-7000-8000-000000000001')?.qr).toBe('private-qr-value');
    now = new Date('2026-08-07T00:01:00.001Z');
    expect(store.get('01988c36-6880-7000-8000-000000000001')).toBeNull();
  });

  it('isolates QR entries by tenant identifier', () => {
    const store = new EphemeralQrStore();
    store.put('tenant-a', 'qr-a');
    expect(store.get('tenant-b')).toBeNull();
  });

  it('serves one consistent QR to concurrent viewers and invalidates it on rotation', () => {
    const store = new EphemeralQrStore();
    store.put('tenant-a', 'qr-generation-one');

    const firstViewer = store.get('tenant-a');
    const secondViewer = store.get('tenant-a');
    expect(secondViewer).toEqual(firstViewer);

    store.put('tenant-a', 'qr-generation-two');
    expect(store.get('tenant-a')?.qr).toBe('qr-generation-two');
    expect(store.get('tenant-a')?.qr).not.toBe(firstViewer?.qr);
  });
});
