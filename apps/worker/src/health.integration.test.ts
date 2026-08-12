import { afterEach, describe, expect, it } from 'vitest';

import { createWorkerHealthServer } from './health.js';

const activeServers: ReturnType<typeof createWorkerHealthServer>[] = [];

afterEach(async () => {
  await Promise.all(
    activeServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.closeAllConnections();
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
});

describe('worker health foundation', () => {
  it('serves a live response over TCP', async () => {
    const server = createWorkerHealthServer();
    activeServers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected a TCP server address');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/health/live`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ service: 'worker', status: 'live' });
  });

  it('keeps readiness separate from liveness', async () => {
    let ready = false;
    const server = createWorkerHealthServer(() => ready);
    activeServers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP address');
    const url = `http://127.0.0.1:${address.port}/health/ready`;
    expect((await fetch(url)).status).toBe(503);
    ready = true;
    expect((await fetch(url)).status).toBe(200);
  });
});
