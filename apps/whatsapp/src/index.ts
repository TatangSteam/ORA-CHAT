import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serviceNameSchema } from '@raho/contracts';
import { createDatabaseClient } from '@raho/db';

import { BaileysAdapter } from './adapter.js';
import { createWhatsAppHealthServer, parseWhatsAppHealthPort } from './health.js';
import { readWhatsAppInternalToken } from './internal-auth.js';
import { InternalApiInboundSink } from './inbound.js';
import { EphemeralQrStore } from './qr-store.js';
import { installSensitiveConsoleGuard } from './safe-console.js';

export const whatsappServiceName = serviceNameSchema.parse('whatsapp');

const entryPath = process.argv[1] ? resolve(process.argv[1]) : undefined;

if (entryPath === fileURLToPath(import.meta.url)) {
  installSensitiveConsoleGuard();
  const prisma = createDatabaseClient();
  const qrStore = new EphemeralQrStore();
  const internalToken = readWhatsAppInternalToken();
  const inbound = new InternalApiInboundSink(internalToken);
  const adapter = new BaileysAdapter(
    prisma,
    qrStore,
    process.env.WHATSAPP_TENANT_SLUG,
    process.env.WHATSAPP_AUTH_DIRECTORY,
    inbound.send
  );
  const server = createWhatsAppHealthServer(() => adapter.isConnected(), {
    token: internalToken,
    store: qrStore,
    send: (tenantId, recipientJid, content, outboxMessageId) =>
      adapter.send(tenantId, recipientJid, content, outboxMessageId),
    presence: (tenantId, recipientJid, state) => adapter.presence(tenantId, recipientJid, state),
    reconnect: (tenantId) => adapter.reconnect(tenantId),
    disconnect: (tenantId) => adapter.disconnect(tenantId)
  });
  const port = parseWhatsAppHealthPort(process.env.WHATSAPP_HEALTH_PORT);
  server.listen(port, '0.0.0.0', () => {
    process.stdout.write(`RAHO WhatsApp health listening on port ${port}\n`);
  });
  await adapter.start();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`RAHO WhatsApp received ${signal}\n`);
    await adapter.stop();
    await prisma.$disconnect();
    await new Promise<void>((resolveClose, rejectClose) =>
      server.close((error) => (error ? rejectClose(error) : resolveClose()))
    );
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}
