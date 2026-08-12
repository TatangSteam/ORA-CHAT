export interface ContactSummary {
  id: string;
  displayName: string | null;
  normalizedPhone: string;
  maskedPhone: string;
  providerJid: string | null;
  consentStatus: string;
}

export interface ConversationSummary {
  id: string;
  status: string;
  handlingMode: string;
  unreadCount: number;
  followUpRequired: boolean;
  lastMessageAt: string | null;
  contact: ContactSummary;
  lastMessage: MessageSummary | null;
  activeHandoff: { id: string; status: string; priority: string; reasonCode: string } | null;
}

export interface MessageSummary {
  id: string;
  direction: 'incoming' | 'outgoing';
  source: string;
  content: string;
  status: string;
  occurredAt: string;
  events?: Array<{ id: string; eventType: string; toStatus: string; occurredAt: string }>;
}

export interface OutboxSummary {
  id: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  lastErrorCode: string | null;
  createdAt: string;
  message: MessageSummary & {
    conversation: { contact: ContactSummary };
  };
}

export interface HandoffSummary {
  id: string;
  reasonCode: string;
  priority: string;
  status: string;
  resolutionNote: string | null;
  createdAt: string;
  conversation: { id: string; contact: ContactSummary };
  assigneeUser: { id: string; displayName: string } | null;
}
