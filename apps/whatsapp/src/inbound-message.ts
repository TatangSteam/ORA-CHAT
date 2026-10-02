import {
  extractMessageContent,
  jidNormalizedUser,
  WAMessageStubType,
  type Contact,
  type WAMessage,
  type WAMessageKey
} from 'baileys';

type MessageContent = NonNullable<WAMessage['message']>;

const providerPhoneJidPattern = /^62[0-9]{7,13}@s\.whatsapp\.net$/u;

const normalizedPhoneJid = (value: string | null | undefined): string | null => {
  const normalized = jidNormalizedUser(value ?? undefined);
  return providerPhoneJidPattern.test(normalized) ? normalized : null;
};

const normalizedLid = (value: string | null | undefined): string | null => {
  const normalized = jidNormalizedUser(value ?? undefined);
  return normalized.endsWith('@lid') ? normalized : null;
};

export type InboundDropReason =
  | 'missing_message_id'
  | 'unsupported_chat'
  | 'identity_unresolved'
  | 'unsupported_content'
  | 'content_too_large';

export type NormalizedInboundMessage =
  | {
      status: 'ok';
      providerMessageId: string;
      fromMe: boolean;
      senderJid: string;
      content: string;
      contentType: string;
    }
  | {
      status: 'drop';
      reason: InboundDropReason;
      remoteKind: 'phone' | 'lid' | 'group' | 'broadcast' | 'other' | 'missing';
    };

const remoteKind = (
  jid: string | null | undefined
): 'phone' | 'lid' | 'group' | 'broadcast' | 'other' | 'missing' => {
  if (!jid) return 'missing';
  if (jid.endsWith('@s.whatsapp.net')) return 'phone';
  if (jid.endsWith('@lid')) return 'lid';
  if (jid.endsWith('@g.us')) return 'group';
  if (jid.endsWith('@broadcast')) return 'broadcast';
  return 'other';
};

const nestedMessage = (value: unknown): MessageContent | null => {
  if (!value || typeof value !== 'object' || !('message' in value)) return null;
  const message = value.message;
  return message && typeof message === 'object' ? (message as MessageContent) : null;
};

const normalizedContent = (message: WAMessage): MessageContent | null => {
  let content = extractMessageContent(message.message) ?? null;
  for (let depth = 0; content && depth < 5; depth += 1) {
    const nested = nestedMessage(content.deviceSentMessage);
    if (!nested) break;
    content = extractMessageContent(nested) ?? nested;
  }
  return content;
};

export const inboundPayloadKinds = (message: WAMessage): string[] => {
  const content = normalizedContent(message) ?? message.message;
  return content
    ? Object.keys(content)
        .filter((key) => key !== 'messageContextInfo')
        .sort()
        .slice(0, 8)
    : [];
};

export const inboundFailureKind = (message: WAMessage): string => {
  if (message.messageStubType !== WAMessageStubType.CIPHERTEXT) return 'not_ciphertext';
  const detail = String(message.messageStubParameters?.[0] ?? '').toLowerCase();
  if (detail.includes('message absent from node')) return 'message_absent';
  if (detail.includes('key used already') || detail.includes('never filled')) {
    return 'missing_pre_key';
  }
  if (detail.includes('no session')) return 'missing_session';
  if (detail.includes('bad mac')) return 'bad_mac';
  return 'decrypt_failed';
};

const firstTrimmed = (...values: Array<string | null | undefined>): string | null => {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
};

const nativeFlowText = (paramsJson: string | null | undefined): string | null => {
  if (!paramsJson || paramsJson.length > 8_192) return null;
  try {
    const value = JSON.parse(paramsJson) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    return firstTrimmed(
      typeof record.title === 'string' ? record.title : null,
      typeof record.display_text === 'string' ? record.display_text : null,
      typeof record.selection === 'string' ? record.selection : null,
      typeof record.id === 'string' ? record.id : null
    );
  } catch {
    return null;
  }
};

const fallbackText = (value: unknown, depth = 0): string | null => {
  if (!value || typeof value !== 'object' || depth > 5) return null;
  const record = value as Record<string, unknown>;
  const allowedKeys = [
    'conversation',
    'text',
    'caption',
    'selectedDisplayText',
    'selectedButtonId',
    'selectedRowId',
    'selectedId',
    'displayText',
    'contentText'
  ];
  for (const key of allowedKeys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  for (const [key, candidate] of Object.entries(record)) {
    if (key.endsWith('ContextInfo') || key === 'contextInfo') continue;
    const result = fallbackText(candidate, depth + 1);
    if (result) return result;
  }
  return null;
};

export class InboundIdentityResolver {
  private readonly phoneByLid = new Map<string, string>();

  public remember(lidValue: string | null | undefined, phoneValue: string | null | undefined) {
    const lid = normalizedLid(lidValue);
    const phone = normalizedPhoneJid(phoneValue);
    if (!lid || !phone) return false;
    this.phoneByLid.set(lid, phone);
    return true;
  }

  public rememberContact(contact: Partial<Contact>) {
    const lid = normalizedLid(contact.lid ?? (contact.id?.endsWith('@lid') ? contact.id : null));
    const phone = normalizedPhoneJid(
      contact.phoneNumber ?? (contact.id?.endsWith('@s.whatsapp.net') ? contact.id : null)
    );
    return this.remember(lid, phone);
  }

  public resolve(key: WAMessageKey): string | null {
    for (const candidate of [
      key.remoteJidAlt,
      key.participantAlt,
      key.remoteJid,
      key.participant
    ]) {
      const phone = normalizedPhoneJid(candidate);
      if (phone) return phone;
    }
    for (const candidate of [
      key.remoteJid,
      key.participant,
      key.remoteJidAlt,
      key.participantAlt
    ]) {
      const lid = normalizedLid(candidate);
      const phone = lid ? this.phoneByLid.get(lid) : null;
      if (phone) return phone;
    }
    return null;
  }
}

const textContent = (message: WAMessage): { content: string; contentType: string } | null => {
  const content = normalizedContent(message);
  if (!content) return null;
  const candidates: Array<[string | null | undefined, string]> = [
    [content.conversation, 'conversation'],
    [content.extendedTextMessage?.text, 'extended_text'],
    [content.imageMessage?.caption, 'image_caption'],
    [content.videoMessage?.caption, 'video_caption'],
    [content.documentMessage?.caption, 'document_caption'],
    [
      content.buttonsResponseMessage?.selectedDisplayText ??
        content.buttonsResponseMessage?.selectedButtonId,
      'button_response'
    ],
    [
      content.listResponseMessage?.title ??
        content.listResponseMessage?.description ??
        content.listResponseMessage?.singleSelectReply?.selectedRowId,
      'list_response'
    ],
    [
      content.templateButtonReplyMessage?.selectedDisplayText ??
        content.templateButtonReplyMessage?.selectedId,
      'template_button_response'
    ]
  ];
  for (const [candidate, contentType] of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return { content: trimmed, contentType };
  }

  const interactive = firstTrimmed(
    content.interactiveResponseMessage?.body?.text,
    nativeFlowText(content.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson)
  );
  if (interactive) return { content: interactive, contentType: 'interactive_response' };

  if (content.audioMessage) {
    return {
      content: content.audioMessage.ptt ? '🎤 Pesan suara' : '🎵 Audio',
      contentType: content.audioMessage.ptt ? 'voice_note' : 'audio'
    };
  }
  if (content.imageMessage) return { content: '📷 Gambar', contentType: 'image' };
  if (content.videoMessage || content.ptvMessage) {
    return { content: '🎥 Video', contentType: 'video' };
  }
  if (content.documentMessage) {
    const fileName = firstTrimmed(content.documentMessage.fileName, content.documentMessage.title);
    return {
      content: fileName ? `📎 Dokumen: ${fileName}` : '📎 Dokumen',
      contentType: 'document'
    };
  }
  if (content.stickerMessage || content.lottieStickerMessage) {
    return { content: '🖼️ Stiker', contentType: 'sticker' };
  }
  if (content.locationMessage) {
    const label = firstTrimmed(
      content.locationMessage.name,
      content.locationMessage.address,
      content.locationMessage.comment
    );
    return {
      content: label ? `📍 Lokasi: ${label}` : '📍 Lokasi dibagikan',
      contentType: 'location'
    };
  }
  if (content.liveLocationMessage) {
    return { content: '📍 Lokasi langsung dibagikan', contentType: 'live_location' };
  }
  if (content.contactMessage) {
    const name = firstTrimmed(content.contactMessage.displayName);
    return {
      content: name ? `👤 Kontak: ${name}` : '👤 Kontak dibagikan',
      contentType: 'contact'
    };
  }
  if (content.contactsArrayMessage) {
    return { content: '👥 Beberapa kontak dibagikan', contentType: 'contacts' };
  }
  const poll =
    content.pollCreationMessage ?? content.pollCreationMessageV2 ?? content.pollCreationMessageV3;
  if (poll?.name?.trim()) {
    return { content: `📊 Polling: ${poll.name.trim()}`, contentType: 'poll' };
  }
  if (content.reactionMessage?.text?.trim()) {
    return {
      content: `Reaksi: ${content.reactionMessage.text.trim()}`,
      contentType: 'reaction'
    };
  }

  const recovered = fallbackText(content);
  return recovered ? { content: recovered, contentType: 'recovered_text' } : null;
};

export const normalizeInboundMessage = (
  message: WAMessage,
  identities: InboundIdentityResolver
): NormalizedInboundMessage => {
  const kind = remoteKind(message.key.remoteJid);
  if (!message.key.id) return { status: 'drop', reason: 'missing_message_id', remoteKind: kind };
  if (!['phone', 'lid'].includes(kind)) {
    return { status: 'drop', reason: 'unsupported_chat', remoteKind: kind };
  }
  const senderJid = identities.resolve(
    message.key.fromMe
      ? {
          ...(message.key.remoteJid ? { remoteJid: message.key.remoteJid } : {}),
          ...(message.key.remoteJidAlt ? { remoteJidAlt: message.key.remoteJidAlt } : {})
        }
      : message.key
  );
  if (!senderJid) {
    return { status: 'drop', reason: 'identity_unresolved', remoteKind: kind };
  }
  const text = textContent(message);
  if (!text) return { status: 'drop', reason: 'unsupported_content', remoteKind: kind };
  if (text.content.length > 4096) {
    return { status: 'drop', reason: 'content_too_large', remoteKind: kind };
  }
  return {
    status: 'ok',
    providerMessageId: message.key.id,
    fromMe: message.key.fromMe === true,
    senderJid,
    content: text.content,
    contentType: text.contentType
  };
};
