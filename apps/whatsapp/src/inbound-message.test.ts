import { WAMessageStubType, type WAMessage } from 'baileys';
import { describe, expect, it } from 'vitest';

import {
  inboundFailureKind,
  inboundPayloadKinds,
  InboundIdentityResolver,
  normalizeInboundMessage
} from './inbound-message.js';

const message = (
  key: WAMessage['key'],
  content: WAMessage['message'] = { conversation: 'menu' }
): WAMessage => ({ key, message: content });

describe('WhatsApp inbound normalization', () => {
  it('accepts a direct phone-number JID', () => {
    const result = normalizeInboundMessage(
      message({ id: 'provider-1', remoteJid: '6281234567890@s.whatsapp.net', fromMe: false }),
      new InboundIdentityResolver()
    );

    expect(result).toMatchObject({
      status: 'ok',
      senderJid: '6281234567890@s.whatsapp.net',
      content: 'menu'
    });
  });

  it('resolves an LID message from the senderPn supplied by Baileys', () => {
    const result = normalizeInboundMessage(
      message({
        id: 'provider-2',
        remoteJid: '123456789012345@lid',
        remoteJidAlt: '6281234567890:7@s.whatsapp.net',
        fromMe: false
      }),
      new InboundIdentityResolver()
    );

    expect(result).toMatchObject({
      status: 'ok',
      senderJid: '6281234567890@s.whatsapp.net',
      content: 'menu'
    });
  });

  it('uses a safely learned LID-to-phone mapping when senderPn is absent', () => {
    const identities = new InboundIdentityResolver();
    expect(identities.remember('123456789012345:4@lid', '6281234567890:7@s.whatsapp.net')).toBe(
      true
    );

    const result = normalizeInboundMessage(
      message({ id: 'provider-3', remoteJid: '123456789012345@lid', fromMe: false }),
      identities
    );

    expect(result).toMatchObject({
      status: 'ok',
      senderJid: '6281234567890@s.whatsapp.net'
    });
  });

  it('drops an unresolved LID instead of inventing a phone number', () => {
    const result = normalizeInboundMessage(
      message({ id: 'provider-4', remoteJid: '123456789012345@lid', fromMe: false }),
      new InboundIdentityResolver()
    );

    expect(result).toEqual({
      status: 'drop',
      reason: 'identity_unresolved',
      remoteKind: 'lid'
    });
  });

  it('extracts text inside an ephemeral wrapper', () => {
    const result = normalizeInboundMessage(
      message(
        { id: 'provider-5', remoteJid: '6281234567890@s.whatsapp.net', fromMe: false },
        { ephemeralMessage: { message: { extendedTextMessage: { text: '  menu  ' } } } }
      ),
      new InboundIdentityResolver()
    );

    expect(result).toMatchObject({ status: 'ok', content: 'menu', contentType: 'extended_text' });
  });

  it('extracts customer text inside a device-sent wrapper', () => {
    const wrapped = message(
      { id: 'provider-device', remoteJid: '6281234567890@s.whatsapp.net', fromMe: false },
      { deviceSentMessage: { message: { conversation: 'menu' } } }
    );

    expect(normalizeInboundMessage(wrapped, new InboundIdentityResolver())).toMatchObject({
      status: 'ok',
      content: 'menu'
    });
  });

  it.each([
    [{ imageMessage: {} }, '📷 Gambar', 'image'],
    [{ audioMessage: { ptt: true } }, '🎤 Pesan suara', 'voice_note'],
    [{ stickerMessage: {} }, '🖼️ Stiker', 'sticker'],
    [{ documentMessage: { fileName: 'brosur.pdf' } }, '📎 Dokumen: brosur.pdf', 'document']
  ] as const)('turns customer media into an Inbox-safe summary', (content, copy, contentType) => {
    const result = normalizeInboundMessage(
      message(
        { id: `provider-${contentType}`, remoteJid: '6281234567890@s.whatsapp.net', fromMe: false },
        content
      ),
      new InboundIdentityResolver()
    );

    expect(result).toMatchObject({ status: 'ok', content: copy, contentType });
  });

  it('extracts a customer selection from a native interactive response', () => {
    const result = normalizeInboundMessage(
      message(
        { id: 'provider-interactive', remoteJid: '6281234567890@s.whatsapp.net', fromMe: false },
        {
          interactiveResponseMessage: {
            nativeFlowResponseMessage: { paramsJson: JSON.stringify({ title: 'Layanan' }) }
          }
        }
      ),
      new InboundIdentityResolver()
    );

    expect(result).toMatchObject({
      status: 'ok',
      content: 'Layanan',
      contentType: 'interactive_response'
    });
  });

  it('keeps technical protocol events out and reports only safe payload kinds', () => {
    const technical = message(
      { id: 'provider-protocol', remoteJid: '6281234567890@s.whatsapp.net', fromMe: false },
      { protocolMessage: { type: 0 }, messageContextInfo: {} }
    );

    expect(normalizeInboundMessage(technical, new InboundIdentityResolver())).toMatchObject({
      status: 'drop',
      reason: 'unsupported_content'
    });
    expect(inboundPayloadKinds(technical)).toEqual(['protocolMessage']);
  });

  it('classifies ciphertext failures without exposing raw provider diagnostics', () => {
    const ciphertext = {
      ...message({ id: 'provider-ciphertext', remoteJid: '123456789012345@lid', fromMe: false }),
      message: null,
      messageStubType: WAMessageStubType.CIPHERTEXT,
      messageStubParameters: ['No session record for incoming message']
    } satisfies WAMessage;

    expect(inboundFailureKind(ciphertext)).toBe('missing_session');
  });

  it('does not ingest group messages into the one-to-one Inbox', () => {
    const result = normalizeInboundMessage(
      message({
        id: 'provider-6',
        remoteJid: '123456789@g.us',
        participantAlt: '6281234567890@s.whatsapp.net',
        fromMe: false
      }),
      new InboundIdentityResolver()
    );

    expect(result).toEqual({
      status: 'drop',
      reason: 'unsupported_chat',
      remoteKind: 'group'
    });
  });

  it('rejects text beyond the API boundary limit', () => {
    const result = normalizeInboundMessage(
      message(
        { id: 'provider-7', remoteJid: '6281234567890@s.whatsapp.net', fromMe: false },
        { conversation: 'a'.repeat(4097) }
      ),
      new InboundIdentityResolver()
    );

    expect(result).toMatchObject({ status: 'drop', reason: 'content_too_large' });
  });
});
