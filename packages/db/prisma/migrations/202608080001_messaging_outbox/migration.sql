CREATE TABLE "contacts" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "display_name" VARCHAR(160),
  "normalized_phone" VARCHAR(20) NOT NULL,
  "provider_jid" VARCHAR(160),
  "consent_status" VARCHAR(24) NOT NULL DEFAULT 'unknown',
  "last_inbound_at" TIMESTAMPTZ(3),
  "last_outbound_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "contacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contacts_phone_check" CHECK ("normalized_phone" ~ '^62[0-9]{7,13}$'),
  CONSTRAINT "contacts_consent_check" CHECK ("consent_status" IN ('unknown', 'opted_in', 'opted_out'))
);

CREATE TABLE "conversations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "owner_user_id" UUID,
  "channel" VARCHAR(24) NOT NULL DEFAULT 'whatsapp',
  "status" VARCHAR(24) NOT NULL DEFAULT 'open',
  "handling_mode" VARCHAR(24) NOT NULL DEFAULT 'bot',
  "unread_count" INTEGER NOT NULL DEFAULT 0,
  "follow_up_required" BOOLEAN NOT NULL DEFAULT false,
  "last_message_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversations_channel_check" CHECK ("channel" IN ('whatsapp', 'playground')),
  CONSTRAINT "conversations_status_check" CHECK ("status" IN ('open', 'closed', 'archived')),
  CONSTRAINT "conversations_handling_check" CHECK ("handling_mode" IN ('bot', 'human')),
  CONSTRAINT "conversations_unread_check" CHECK ("unread_count" >= 0)
);

CREATE TABLE "messages" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "reply_to_message_id" UUID,
  "direction" VARCHAR(16) NOT NULL,
  "source" VARCHAR(24) NOT NULL,
  "message_type" VARCHAR(24) NOT NULL DEFAULT 'text',
  "content" VARCHAR(4096) NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "provider_message_id" VARCHAR(191),
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_direction_check" CHECK ("direction" IN ('incoming', 'outgoing')),
  CONSTRAINT "messages_source_check" CHECK ("source" IN ('provider', 'manual', 'rule', 'ai')),
  CONSTRAINT "messages_type_check" CHECK ("message_type" IN ('text')),
  CONSTRAINT "messages_status_check" CHECK ("status" IN ('received', 'draft', 'scheduled', 'queued', 'leased', 'sending', 'sent', 'failed', 'unknown', 'cancelled')),
  CONSTRAINT "messages_content_check" CHECK (char_length("content") BETWEEN 1 AND 4096)
);

CREATE TABLE "message_events" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "event_type" VARCHAR(48) NOT NULL,
  "from_status" VARCHAR(24),
  "to_status" VARCHAR(24) NOT NULL,
  "provider_event_id" VARCHAR(191),
  "safe_metadata" JSONB NOT NULL DEFAULT '{}',
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "message_events_metadata_check" CHECK (jsonb_typeof("safe_metadata") = 'object')
);

CREATE TABLE "outbox_messages" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'queued',
  "deterministic_job_id" VARCHAR(96) NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_expires_at" TIMESTAMPTZ(3),
  "leased_by" VARCHAR(120),
  "delivery_attempt_id" UUID,
  "last_error_code" VARCHAR(80),
  "dispatched_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outbox_messages_status_check" CHECK ("status" IN ('queued', 'leased', 'sending', 'sent', 'retryable', 'failed', 'unknown', 'cancelled')),
  CONSTRAINT "outbox_messages_attempt_check" CHECK ("attempt_count" >= 0 AND "max_attempts" BETWEEN 1 AND 10)
);

CREATE TABLE "idempotency_keys" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "scope" VARCHAR(64) NOT NULL,
  "key" VARCHAR(128) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "resource_type" VARCHAR(64) NOT NULL,
  "resource_id" UUID NOT NULL,
  "response_status" INTEGER NOT NULL,
  "response_snapshot" JSONB NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "idempotency_keys_response_check" CHECK ("response_status" BETWEEN 200 AND 599),
  CONSTRAINT "idempotency_keys_snapshot_check" CHECK (jsonb_typeof("response_snapshot") = 'object')
);

CREATE TABLE "handoff_tasks" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "trigger_message_id" UUID,
  "assignee_user_id" UUID,
  "reason_code" VARCHAR(64) NOT NULL,
  "priority" VARCHAR(16) NOT NULL DEFAULT 'normal',
  "status" VARCHAR(24) NOT NULL DEFAULT 'open',
  "resolution_note" VARCHAR(1000),
  "assigned_at" TIMESTAMPTZ(3),
  "resolved_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "handoff_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "handoff_tasks_priority_check" CHECK ("priority" IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT "handoff_tasks_status_check" CHECK ("status" IN ('open', 'assigned', 'resolved', 'cancelled'))
);

CREATE TABLE "chatbot_rule_versions" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "greeting" VARCHAR(4096),
  "fallback" VARCHAR(4096) NOT NULL,
  "created_by_user_id" UUID,
  "published_by_user_id" UUID,
  "published_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "chatbot_rule_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chatbot_rule_versions_status_check" CHECK ("status" IN ('draft', 'published', 'archived')),
  CONSTRAINT "chatbot_rule_versions_revision_check" CHECK ("revision" >= 0)
);

CREATE TABLE "chatbot_rules" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "rule_version_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "trigger_type" VARCHAR(32) NOT NULL,
  "trigger_config" JSONB NOT NULL,
  "response_type" VARCHAR(32) NOT NULL DEFAULT 'text',
  "response_config" JSONB NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "chatbot_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chatbot_rules_sequence_check" CHECK ("sequence" >= 0),
  CONSTRAINT "chatbot_rules_trigger_check" CHECK ("trigger_type" IN ('exact', 'contains', 'starts_with', 'fallback')),
  CONSTRAINT "chatbot_rules_response_check" CHECK ("response_type" IN ('text')),
  CONSTRAINT "chatbot_rules_config_check" CHECK (jsonb_typeof("trigger_config") = 'object' AND jsonb_typeof("response_config") = 'object')
);

CREATE UNIQUE INDEX "contacts_tenant_id_normalized_phone_key" ON "contacts"("tenant_id", "normalized_phone");
CREATE UNIQUE INDEX "contacts_tenant_id_provider_jid_key" ON "contacts"("tenant_id", "provider_jid");
CREATE INDEX "contacts_tenant_id_display_name_id_idx" ON "contacts"("tenant_id", "display_name", "id");
CREATE UNIQUE INDEX "conversations_tenant_id_contact_id_channel_key" ON "conversations"("tenant_id", "contact_id", "channel");
CREATE INDEX "conversations_tenant_id_status_last_message_at_id_idx" ON "conversations"("tenant_id", "status", "last_message_at" DESC, "id");
CREATE UNIQUE INDEX "messages_tenant_id_provider_message_id_key" ON "messages"("tenant_id", "provider_message_id");
CREATE INDEX "messages_tenant_id_conversation_id_occurred_at_id_idx" ON "messages"("tenant_id", "conversation_id", "occurred_at" DESC, "id");
CREATE UNIQUE INDEX "message_events_tenant_id_provider_event_id_key" ON "message_events"("tenant_id", "provider_event_id");
CREATE INDEX "message_events_tenant_id_message_id_occurred_at_id_idx" ON "message_events"("tenant_id", "message_id", "occurred_at", "id");
CREATE UNIQUE INDEX "outbox_messages_message_id_key" ON "outbox_messages"("message_id");
CREATE UNIQUE INDEX "outbox_messages_tenant_id_deterministic_job_id_key" ON "outbox_messages"("tenant_id", "deterministic_job_id");
CREATE INDEX "outbox_messages_tenant_id_status_available_at_idx" ON "outbox_messages"("tenant_id", "status", "available_at");
CREATE UNIQUE INDEX "idempotency_keys_tenant_id_scope_key_key" ON "idempotency_keys"("tenant_id", "scope", "key");
CREATE INDEX "idempotency_keys_tenant_id_expires_at_idx" ON "idempotency_keys"("tenant_id", "expires_at");
CREATE INDEX "handoff_tasks_tenant_id_status_priority_created_at_idx" ON "handoff_tasks"("tenant_id", "status", "priority", "created_at");
CREATE UNIQUE INDEX "handoff_tasks_one_active_reason_key" ON "handoff_tasks"("tenant_id", "conversation_id", "reason_code") WHERE "status" IN ('open', 'assigned');
CREATE UNIQUE INDEX "chatbot_rule_versions_tenant_id_version_key" ON "chatbot_rule_versions"("tenant_id", "version");
CREATE UNIQUE INDEX "chatbot_rule_versions_one_published_key" ON "chatbot_rule_versions"("tenant_id") WHERE "status" = 'published';
CREATE INDEX "chatbot_rule_versions_tenant_id_status_version_idx" ON "chatbot_rule_versions"("tenant_id", "status", "version" DESC);
CREATE UNIQUE INDEX "chatbot_rules_rule_version_id_sequence_key" ON "chatbot_rules"("rule_version_id", "sequence");
CREATE INDEX "chatbot_rules_tenant_id_rule_version_id_sequence_idx" ON "chatbot_rules"("tenant_id", "rule_version_id", "sequence");

ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "handoff_tasks" ADD CONSTRAINT "handoff_tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "handoff_tasks" ADD CONSTRAINT "handoff_tasks_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "handoff_tasks" ADD CONSTRAINT "handoff_tasks_trigger_message_id_fkey" FOREIGN KEY ("trigger_message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "handoff_tasks" ADD CONSTRAINT "handoff_tasks_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chatbot_rule_versions" ADD CONSTRAINT "chatbot_rule_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chatbot_rule_versions" ADD CONSTRAINT "chatbot_rule_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chatbot_rule_versions" ADD CONSTRAINT "chatbot_rule_versions_published_by_user_id_fkey" FOREIGN KEY ("published_by_user_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chatbot_rules" ADD CONSTRAINT "chatbot_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chatbot_rules" ADD CONSTRAINT "chatbot_rules_rule_version_id_fkey" FOREIGN KEY ("rule_version_id") REFERENCES "chatbot_rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION reject_message_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'message_events is append-only';
END;
$$;

CREATE TRIGGER message_events_append_only
BEFORE UPDATE OR DELETE ON "message_events"
FOR EACH ROW EXECUTE FUNCTION reject_message_event_mutation();
