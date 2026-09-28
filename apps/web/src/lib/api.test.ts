import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const response = () =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ data: { state: 'connected' }, meta: {} })
  }) as Response;

describe('admin session activity signal', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does not let background API polling signal user activity', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetchMock);
    const { api } = await import('./api.js');

    await api('/session');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).has('x-session-activity')).toBe(false);
  });

  it('signals recent interaction only for a bounded window', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetchMock);
    const { api, markUserActivity } = await import('./api.js');

    markUserActivity();
    await api('/session');
    vi.advanceTimersByTime(30_001);
    await api('/session');

    const recentInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const expiredInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(recentInit.headers).get('x-session-activity')).toBe('1');
    expect(new Headers(expiredInit.headers).has('x-session-activity')).toBe(false);
  });
});
