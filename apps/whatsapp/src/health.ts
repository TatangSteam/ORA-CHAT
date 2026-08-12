import { createServer, type IncomingMessage, type Server } from 'node:http';

import {
  healthResponseSchema,
  internalOutboundSendRequestSchema,
  readinessResponseSchema
} from '@raho/contracts';

import { verifyInternalToken } from './internal-auth.js';
import type { EphemeralQrStore } from './qr-store.js';

interface InternalServiceOptions {
  token: string;
  store: EphemeralQrStore;
  send?: (
    tenantId: string,
    recipientJid: string,
    content: string
  ) => Promise<{ providerMessageId: string }>;
  reconnect?: (tenantId: string) => Promise<void>;
  disconnect?: (tenantId: string) => Promise<void>;
}

const readJson = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 16_384) throw new Error('request_too_large');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

export const parseWhatsAppHealthPort = (value: string | undefined): number => {
  const port = Number(value ?? 4020);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('WHATSAPP_HEALTH_PORT must be an integer between 1 and 65535');
  }
  return port;
};

export const createWhatsAppHealthServer = (
  isReady: () => boolean = () => false,
  internalQr?: InternalServiceOptions
): Server =>
  createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health/live') {
      const payload = healthResponseSchema.parse({ service: 'whatsapp', status: 'live' });
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(payload));
      return;
    }
    if (request.method === 'GET' && request.url === '/health/ready') {
      const ready = isReady();
      const payload = readinessResponseSchema.parse({
        service: 'whatsapp',
        status: ready ? 'ready' : 'not_ready',
        checkedAt: new Date().toISOString()
      });
      response.writeHead(ready ? 200 : 503, {
        'content-type': 'application/json; charset=utf-8'
      });
      response.end(JSON.stringify(payload));
      return;
    }
    if (request.method === 'GET' && request.url === '/internal/v1/qr' && internalQr) {
      if (!verifyInternalToken(internalQr.token, request.headers.authorization)) {
        response.writeHead(401, {
          'cache-control': 'no-store',
          'content-type': 'application/json; charset=utf-8',
          'x-content-type-options': 'nosniff'
        });
        response.end('{"error":"unauthorized"}');
        return;
      }
      const tenantId = request.headers['x-tenant-id'];
      const entry =
        typeof tenantId === 'string' && /^[0-9a-f-]{36}$/iu.test(tenantId)
          ? internalQr.store.get(tenantId)
          : null;
      if (!entry) {
        response.writeHead(404, {
          'cache-control': 'no-store',
          'content-type': 'application/json; charset=utf-8',
          'x-content-type-options': 'nosniff'
        });
        response.end('{"error":"not_available"}');
        return;
      }
      response.writeHead(200, {
        'cache-control': 'no-store, max-age=0',
        'content-type': 'application/json; charset=utf-8',
        pragma: 'no-cache',
        'x-content-type-options': 'nosniff'
      });
      response.end(JSON.stringify({ qr: entry.qr, expiresAt: entry.expiresAt.toISOString() }));
      return;
    }
    if (request.method === 'POST' && request.url === '/internal/v1/send' && internalQr?.send) {
      if (!verifyInternalToken(internalQr.token, request.headers.authorization)) {
        response.writeHead(401, {
          'cache-control': 'no-store',
          'content-type': 'application/json; charset=utf-8',
          'x-content-type-options': 'nosniff'
        });
        response.end('{"error":"unauthorized"}');
        return;
      }
      void readJson(request)
        .then((body) => internalOutboundSendRequestSchema.parseAsync(body))
        .then((input) => internalQr.send!(input.tenantId, input.recipientJid, input.content))
        .then((result) => {
          response.writeHead(200, {
            'cache-control': 'no-store',
            'content-type': 'application/json; charset=utf-8',
            'x-content-type-options': 'nosniff'
          });
          response.end(JSON.stringify(result));
        })
        .catch((error: unknown) => {
          const code = error instanceof Error ? error.message : '';
          response.writeHead(code === 'whatsapp_not_connected' ? 409 : 400, {
            'cache-control': 'no-store',
            'content-type': 'application/json; charset=utf-8',
            'x-content-type-options': 'nosniff'
          });
          response.end('{"error":"send_rejected"}');
        });
      return;
    }
    const sessionAction =
      request.method === 'POST' && request.url?.startsWith('/internal/v1/session/')
        ? request.url.slice('/internal/v1/session/'.length)
        : null;
    const sessionControl =
      sessionAction === 'reconnect'
        ? internalQr?.reconnect
        : sessionAction === 'disconnect'
          ? internalQr?.disconnect
          : undefined;
    if (sessionControl && internalQr) {
      if (!verifyInternalToken(internalQr.token, request.headers.authorization)) {
        response.writeHead(401, {
          'cache-control': 'no-store',
          'content-type': 'application/json; charset=utf-8',
          'x-content-type-options': 'nosniff'
        });
        response.end('{"error":"unauthorized"}');
        return;
      }
      const tenantId = request.headers['x-tenant-id'];
      if (typeof tenantId !== 'string' || !/^[0-9a-f-]{36}$/iu.test(tenantId)) {
        response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        response.end('{"error":"invalid_tenant"}');
        return;
      }
      void sessionControl(tenantId)
        .then(() => response.writeHead(204, { 'cache-control': 'no-store' }).end())
        .catch(() => {
          response.writeHead(409, {
            'cache-control': 'no-store',
            'content-type': 'application/json; charset=utf-8'
          });
          response.end('{"error":"control_rejected"}');
        });
      return;
    }
    response.writeHead(404).end();
  });
