import { createServer, type IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import {
  getResponse,
  http as mswHttp,
  HttpResponse
} from '../../whatsapp-chatbot/whatsapp-control-panel/node_modules/msw/lib/core/index.mjs';
import { handlers } from '../../whatsapp-chatbot/whatsapp-control-panel/src/mocks/handlers.ts';

const host = '127.0.0.1';
const port = 3000;
let authenticated = false;

const meta = () => ({
  requestId: 'req_gate_a_visual_baseline',
  generatedAt: new Date().toISOString()
});

const admin = {
  id: 'gate-a-admin',
  username: 'admin',
  displayName: 'Local Admin',
  role: 'admin' as const,
  permissions: [
    'dashboard.read',
    'contacts.read',
    'messages.read',
    'messages.send',
    'messages.cancel',
    'handoffs.manage',
    'session.reconnect',
    'safety.pause',
    'safety.resume',
    'session.reset',
    'chatbot.manage',
    'audit.read',
    'users.manage'
  ]
};

const authenticationHandler = mswHttp.get(
  '*/api/admin/v1/me',
  () =>
    authenticated
      ? HttpResponse.json({ data: admin, meta: meta() })
      : HttpResponse.json(
          {
            error: {
              code: 'AUTHENTICATION_REQUIRED',
              message: 'Authentication is required',
              requestId: 'req_gate_a_unauthenticated'
            }
          },
          { status: 401 }
        )
);

const readBody = async (
  request: IncomingMessage
): Promise<Uint8Array | undefined> => {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
};

const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url ?? '/', `http://${host}:${port}`);

    if (url.pathname === '/__gate-a/auth/enable') {
      authenticated = true;
      outgoing.writeHead(204).end();
      return;
    }
    if (url.pathname === '/__gate-a/auth/disable') {
      authenticated = false;
      outgoing.writeHead(204).end();
      return;
    }
    if (url.pathname === '/__gate-a/status') {
      outgoing
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ authenticated }));
      return;
    }

    const body = await readBody(incoming);
    const request = new Request(url, {
      method: incoming.method,
      headers: incoming.headers as HeadersInit,
      body,
      duplex: body ? 'half' : undefined
    } as RequestInit & { duplex?: 'half' });
    const response = await getResponse(
      [authenticationHandler, ...handlers],
      request,
      { baseUrl: new URL(`http://${host}:${port}`) }
    );

    if (!response) {
      outgoing
        .writeHead(404, { 'content-type': 'application/json' })
        .end(JSON.stringify({ error: { code: 'GATE_A_MOCK_NOT_FOUND' } }));
      return;
    }

    const headers = Object.fromEntries(response.headers.entries());
    outgoing.writeHead(response.status, headers);
    if (!response.body) {
      outgoing.end();
      return;
    }
    Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
      .pipe(outgoing);
  } catch (error) {
    outgoing
      .writeHead(500, { 'content-type': 'application/json' })
      .end(
        JSON.stringify({
          error: {
            code: 'GATE_A_MOCK_FAILURE',
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        })
      );
  }
});

server.listen(port, host, () => {
  process.stdout.write(
    `Gate A visual baseline API listening on http://${host}:${port}\n`
  );
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
