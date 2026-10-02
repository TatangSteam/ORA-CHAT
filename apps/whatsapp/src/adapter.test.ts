import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WAMessage } from 'baileys';
import type * as BaileysModule from 'baileys';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: never) => void>(),
  sendMessage: vi.fn(),
  end: vi.fn()
}));
vi.mock('baileys', async (importOriginal) => {
  const original = await importOriginal<typeof BaileysModule>();
  return {
    ...original,
    useMultiFileAuthState: async () => ({ state: {}, saveCreds: vi.fn() }),
    default: () => ({
      user: { id: '6289999999999@s.whatsapp.net' },
      ev: {
        on: (name: string, handler: (event: never) => void) => mocks.handlers.set(name, handler)
      },
      sendMessage: mocks.sendMessage,
      end: mocks.end
    })
  };
});

import { BaileysAdapter, providerMessageTime } from './adapter.js';
import { EphemeralQrStore } from './qr-store.js';

const adapters: BaileysAdapter[] = [];
afterEach(async () => {
  await Promise.all(adapters.splice(0).map((adapter) => adapter.stop()));
  mocks.handlers.clear();
  vi.clearAllMocks();
});
const emit = (name: string, value: unknown) => mocks.handlers.get(name)!(value as never);
const setup = async (existingProviderId: string | null = null) => {
  const prisma = {
    tenant: { findUnique: vi.fn().mockResolvedValue({ id: 'tenant' }) },
    whatsAppSessionState: { update: vi.fn() },
    outboxMessage: {
      findFirst: vi.fn().mockResolvedValue({
        message: { id: 'dashboard-message', providerMessageId: existingProviderId }
      })
    },
    message: { update: vi.fn() }
  };
  const sink = vi.fn().mockResolvedValue(undefined);
  const adapter = new BaileysAdapter(
    prisma as never,
    new EphemeralQrStore(),
    'default',
    '/tmp/unused-mocked-auth',
    sink
  );
  adapters.push(adapter);
  await adapter.start();
  emit('connection.update', { connection: 'open' });
  return { adapter, prisma, sink };
};

describe('WhatsApp bidirectional message sync', () => {
  it.each(['notify', 'append'])(
    'forwards phone replies from %s without using the admin name as the contact name',
    async (type) => {
      const { sink } = await setup();
      emit('messages.upsert', {
        type,
        messages: [
          {
            key: { id: 'phone-id', fromMe: true, remoteJid: '6281234567890@s.whatsapp.net' },
            pushName: 'Admin',
            messageTimestamp: 1790906400,
            message: { conversation: 'Saya bantu ya' }
          }
        ]
      });
      expect(sink).toHaveBeenCalledWith(
        expect.objectContaining({
          fromMe: true,
          providerMessageId: 'phone-id',
          senderJid: '6281234567890@s.whatsapp.net',
          content: 'Saya bantu ya',
          occurredAt: new Date(1790906400000).toISOString()
        })
      );
      expect(sink.mock.calls[0]![0]).not.toHaveProperty('displayName');
    }
  );

  it('does not turn appended historical customer messages into new AI requests', async () => {
    const { sink } = await setup();
    emit('messages.upsert', {
      type: 'append',
      messages: [
        {
          key: { id: 'old-inbound', fromMe: false, remoteJid: '6281234567890@s.whatsapp.net' },
          message: { conversation: 'Halo' }
        }
      ]
    });
    expect(sink).not.toHaveBeenCalled();
  });

  it.each([null, 'existing-provider-id'])(
    'persists the provider ID before a dashboard send, including immediate echoes: %s',
    async (existingProviderId) => {
      const { adapter, prisma } = await setup(existingProviderId);
      mocks.sendMessage.mockImplementation(async (_jid, _body, { messageId }) => {
        expect(prisma.message.update).toHaveBeenCalledWith({
          where: { id: 'dashboard-message' },
          data: { providerMessageId: messageId }
        });
        if (existingProviderId) expect(messageId).toBe(existingProviderId);
        return { key: { id: messageId } };
      });
      const result = await adapter.send(
        'tenant',
        '6281234567890@s.whatsapp.net',
        'Balasan dashboard',
        'outbox'
      );
      expect(result.providerMessageId).toBeTruthy();
      expect(prisma.outboxMessage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'outbox', tenantId: 'tenant' } })
      );
    }
  );

  it('does not send if the ID cannot be persisted for deduplication', async () => {
    const { adapter, prisma } = await setup();
    prisma.message.update.mockRejectedValue(new Error('database unavailable'));
    await expect(
      adapter.send('tenant', '6281234567890@s.whatsapp.net', 'Reply', 'outbox')
    ).rejects.toThrow('database unavailable');
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('reads protobuf Long timestamps for delayed messages', () => {
    const value = { messageTimestamp: { toString: () => '1790906400' } } as unknown as WAMessage;
    expect(providerMessageTime(value)).toBe(new Date(1790906400000).toISOString());
  });
});
