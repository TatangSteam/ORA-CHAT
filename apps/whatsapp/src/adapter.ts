import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';

import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState,
  type ConnectionState,
  type Contact,
  type WAMessage,
  type WASocket
} from 'baileys';
import type { PrismaClient } from '@raho/db';

import type { EphemeralQrStore } from './qr-store.js';
import {
  inboundFailureKind,
  inboundPayloadKinds,
  InboundIdentityResolver,
  normalizeInboundMessage
} from './inbound-message.js';
import { InboundRecoveryQueue } from './inbound-recovery.js';

export interface InboundMessage {
  tenantId: string;
  providerEventId: string;
  providerMessageId: string;
  senderJid: string;
  displayName?: string;
  content: string;
  occurredAt: string;
}

export type InboundSink = (message: InboundMessage) => Promise<void>;

type SilentLogger = {
  level: string;
  child: (bindings: Record<string, unknown>) => SilentLogger;
  trace: (object: unknown, message?: string) => void;
  debug: (object: unknown, message?: string) => void;
  info: (object: unknown, message?: string) => void;
  warn: (object: unknown, message?: string) => void;
  error: (object: unknown, message?: string) => void;
};

const noop = (...arguments_: unknown[]): void => {
  void arguments_;
};
const silentLogger: SilentLogger = {
  level: 'silent',
  child: () => silentLogger,
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop
};

const disconnectStatus = (error: Error | undefined): number | undefined =>
  (error as (Error & { output?: { statusCode?: number } }) | undefined)?.output?.statusCode;

export class BaileysAdapter {
  private socket: WASocket | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private stopped = false;
  private connectionEnabled = true;
  private connected = false;
  private tenantId: string | undefined;
  private readonly inboundIdentities = new InboundIdentityResolver();
  private readonly inboundRecovery: InboundRecoveryQueue;

  public constructor(
    private readonly prisma: PrismaClient,
    private readonly qrStore: EphemeralQrStore,
    private readonly tenantSlug = process.env.WHATSAPP_TENANT_SLUG ?? 'default',
    private readonly authDirectory = resolve(
      process.env.WHATSAPP_AUTH_DIRECTORY ?? '/var/lib/raho/whatsapp-auth/default'
    ),
    private readonly inboundSink?: InboundSink
  ) {
    this.inboundRecovery = new InboundRecoveryQueue(
      () => (this.connected ? this.socket : undefined),
      undefined,
      (event, attempt) => {
        process.stdout.write(
          `${JSON.stringify({ level: 'info', event: `whatsapp_inbound_recovery_${event}`, attempt })}\n`
        );
      }
    );
  }

  public async start(): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: this.tenantSlug },
      select: { id: true }
    });
    if (!tenant) throw new Error('Configured WhatsApp tenant is unavailable');
    this.tenantId = tenant.id;
    await this.writeState('starting');
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.stopped || !this.connectionEnabled) return;
    this.connected = false;
    await this.writeState('connecting');
    const { state, saveCreds } = await useMultiFileAuthState(this.authDirectory);
    const socket = makeWASocket({
      auth: state,
      browser: Browsers.ubuntu('Chrome'),
      logger: silentLogger,
      markOnlineOnConnect: false,
      shouldSyncHistoryMessage: () => false,
      syncFullHistory: false
    });
    this.socket = socket;
    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', (update) => {
      void this.onConnectionUpdate(socket, update).catch(() => {
        process.stderr.write('{"level":"error","event":"whatsapp_state_update_failed"}\n');
      });
    });
    const rememberContacts = (contacts: Array<Partial<Contact>>) => {
      for (const contact of contacts) this.inboundIdentities.rememberContact(contact);
    };
    socket.ev.on('lid-mapping.update', ({ lid, pn }) => {
      this.inboundIdentities.remember(lid, pn);
    });
    socket.ev.on('contacts.upsert', rememberContacts);
    socket.ev.on('contacts.update', rememberContacts);
    socket.ev.on('messaging-history.set', ({ contacts, lidPnMappings }) => {
      rememberContacts(contacts);
      for (const mapping of lidPnMappings ?? []) {
        this.inboundIdentities.remember(mapping.lid, mapping.pn);
      }
    });
    socket.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const message of messages) {
        void this.ingestInbound(message).catch(() => {
          process.stderr.write('{"level":"error","event":"whatsapp_inbound_failed"}\n');
        });
      }
    });
    socket.ev.on('messages.update', (updates) => {
      for (const { key, update } of updates) {
        if (!update.message) continue;
        void this.ingestInbound({ ...update, key } as WAMessage).catch(() => {
          process.stderr.write('{"level":"error","event":"whatsapp_inbound_failed"}\n');
        });
      }
    });
  }

  private async ingestInbound(message: WAMessage): Promise<void> {
    if (!this.inboundSink || !this.tenantId) return;
    const normalized = normalizeInboundMessage(message, this.inboundIdentities);
    if (normalized.status === 'drop') {
      const failureKind = inboundFailureKind(message);
      if (
        failureKind === 'message_absent' &&
        (normalized.remoteKind === 'phone' || normalized.remoteKind === 'lid')
      ) {
        this.inboundRecovery.enqueue(message);
      }
      if (normalized.reason !== 'from_me') {
        process.stdout.write(
          `${JSON.stringify({
            level: 'info',
            event: 'whatsapp_inbound_dropped',
            reason: normalized.reason,
            remoteKind: normalized.remoteKind,
            failureKind,
            payloadKinds: inboundPayloadKinds(message)
          })}\n`
        );
      }
      return;
    }
    this.inboundRecovery.resolve(normalized.providerMessageId);
    await this.inboundSink({
      tenantId: this.tenantId,
      providerEventId: `${normalized.providerMessageId}:upsert`,
      providerMessageId: normalized.providerMessageId,
      senderJid: normalized.senderJid,
      ...(message.pushName ? { displayName: message.pushName } : {}),
      content: normalized.content,
      occurredAt: new Date().toISOString()
    });
  }

  public async send(
    tenantId: string,
    recipientJid: string,
    content: string
  ): Promise<{ providerMessageId: string }> {
    if (tenantId !== this.tenantId || !this.connected || !this.socket) {
      throw new Error('whatsapp_not_connected');
    }
    const result = await this.socket.sendMessage(recipientJid, { text: content });
    const providerMessageId = result?.key.id;
    if (!providerMessageId) throw new Error('provider_message_id_missing');
    return { providerMessageId };
  }

  public async presence(
    tenantId: string,
    recipientJid: string,
    state: 'composing' | 'paused'
  ): Promise<void> {
    if (tenantId !== this.tenantId || !this.connected || !this.socket) {
      throw new Error('whatsapp_not_connected');
    }
    await this.socket.sendPresenceUpdate(state, recipientJid);
  }

  public async reconnect(tenantId: string): Promise<void> {
    this.assertTenant(tenantId);
    this.connectionEnabled = true;
    this.connected = false;
    this.inboundRecovery.pause();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    const socket = this.socket;
    this.socket = undefined;
    socket?.end(new Error('manual_reconnect'));
    await this.connect();
  }

  public async disconnect(tenantId: string): Promise<void> {
    this.assertTenant(tenantId);
    this.connectionEnabled = false;
    this.connected = false;
    this.inboundRecovery.clear();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.qrStore.clear(tenantId);
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      try {
        await socket.logout();
      } catch {
        socket.end(new Error('manual_disconnect'));
      }
    }
    await rm(this.authDirectory, { force: true, recursive: true });
    await this.writeState('disconnected', {
      connectedJid: null,
      connectedAt: null,
      lastErrorCode: null
    });
  }

  private assertTenant(tenantId: string): void {
    if (!this.tenantId || tenantId !== this.tenantId) throw new Error('tenant_not_configured');
  }

  private async onConnectionUpdate(socket: WASocket, update: Partial<ConnectionState>) {
    const tenantId = this.tenantId;
    if (!tenantId || socket !== this.socket || this.stopped) return;

    if (update.qr) {
      this.qrStore.put(tenantId, update.qr);
      await this.writeState('qr_required', { lastErrorCode: null });
    }
    if (update.connection === 'connecting') await this.writeState('connecting');
    if (update.connection === 'open') {
      this.connected = true;
      this.inboundRecovery.resume();
      this.qrStore.clear(tenantId);
      await this.writeState('connected', {
        connectedJid: socket.user?.id ?? null,
        connectedAt: new Date(),
        lastErrorCode: null
      });
    }
    if (update.connection !== 'close') return;

    this.connected = false;
    this.inboundRecovery.pause();
    this.qrStore.clear(tenantId);
    this.socket = undefined;
    const status = disconnectStatus(update.lastDisconnect?.error);
    if (status === DisconnectReason.loggedOut) {
      await rm(this.authDirectory, { force: true, recursive: true });
      await this.writeState('logged_out', {
        connectedJid: null,
        connectedAt: null,
        lastErrorCode: 'logged_out'
      });
      return;
    }
    if (status === DisconnectReason.badSession) {
      await rm(this.authDirectory, { force: true, recursive: true });
      await this.writeState('bad_session', {
        connectedJid: null,
        connectedAt: null,
        lastErrorCode: 'bad_session'
      });
      return;
    }
    await this.writeState('reconnecting', {
      lastErrorCode: status ? `disconnect_${status}` : 'connection_closed'
    });
    if (this.connectionEnabled) {
      this.reconnectTimer = setTimeout(() => void this.connect(), 5_000);
    }
  }

  private async writeState(
    state: string,
    details: {
      connectedJid?: string | null;
      connectedAt?: Date | null;
      lastErrorCode?: string | null;
    } = {}
  ): Promise<void> {
    if (!this.tenantId) return;
    await this.prisma.whatsAppSessionState.update({
      where: { tenantId: this.tenantId },
      data: {
        state,
        authStorageRef: 'volume://whatsapp_auth/default',
        lastHeartbeatAt: new Date(),
        revision: { increment: 1 },
        ...details
      }
    });
  }

  public async stop(): Promise<void> {
    this.stopped = true;
    this.connected = false;
    this.inboundRecovery.clear();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.tenantId) {
      this.qrStore.clear(this.tenantId);
      await this.writeState('shutting_down');
    }
    this.socket?.end(new Error('service_shutdown'));
    this.socket = undefined;
  }

  public isConnected(): boolean {
    return this.connected;
  }
}
