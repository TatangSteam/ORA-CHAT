CREATE TABLE "handoff_notification_settings" (
  "tenant_id" UUID NOT NULL,
  "normalized_phone" VARCHAR(20),
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "handoff_notification_settings_pkey" PRIMARY KEY ("tenant_id"),
  CONSTRAINT "handoff_notification_settings_phone_check"
    CHECK ("normalized_phone" IS NULL OR "normalized_phone" ~ '^62[0-9]{7,13}$'),
  CONSTRAINT "handoff_notification_settings_enabled_phone_check"
    CHECK (NOT "enabled" OR "normalized_phone" IS NOT NULL)
);

ALTER TABLE "handoff_notification_settings"
  ADD CONSTRAINT "handoff_notification_settings_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "handoff_notification_settings"
  ADD CONSTRAINT "handoff_notification_settings_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
