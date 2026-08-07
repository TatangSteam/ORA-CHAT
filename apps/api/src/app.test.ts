import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';

const activeServers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    activeServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
});

describe('API foundation', () => {
  it('returns the live contract without x-powered-by', async () => {
    const server = createServer(createApp());
    activeServers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected a TCP server address');
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/health/live`
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-powered-by')).toBeNull();
    await expect(response.json()).resolves.toEqual({
      service: 'api',
      status: 'live'
    });
  });
});
