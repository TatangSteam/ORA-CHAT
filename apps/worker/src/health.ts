import { createServer, type Server } from 'node:http';

import { healthResponseSchema, readinessResponseSchema } from '@raho/contracts';

export const parseWorkerHealthPort = (value: string | undefined): number => {
  const port = Number(value ?? 4010);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('WORKER_HEALTH_PORT must be an integer between 1 and 65535');
  }
  return port;
};

export const createWorkerHealthServer = (isReady: () => boolean = () => false): Server =>
  createServer((request, response) => {
    if (request.method !== 'GET') {
      response.writeHead(404).end();
      return;
    }
    if (request.url === '/health/live') {
      const payload = healthResponseSchema.parse({ service: 'worker', status: 'live' });
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(payload));
      return;
    }
    if (request.url === '/health/ready') {
      const ready = isReady();
      response.writeHead(ready ? 200 : 503, {
        'content-type': 'application/json; charset=utf-8'
      });
      response.end(
        JSON.stringify(
          readinessResponseSchema.parse({
            service: 'worker',
            status: ready ? 'ready' : 'not_ready',
            checkedAt: new Date().toISOString()
          })
        )
      );
      return;
    }
    response.writeHead(404).end();
  });
