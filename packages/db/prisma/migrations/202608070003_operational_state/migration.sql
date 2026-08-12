CREATE TABLE "whatsapp_session_states" (
  "tenant_id" UUID NOT NULL,
  "adapter" VARCHAR(32) NOT NULL DEFAULT 'baileys',
  "state" VARCHAR(32) NOT NULL DEFAULT 'logged_out',
  "connected_jid" VARCHAR(160),
  "auth_storage_ref" VARCHAR(500),
  "last_error_code" VARCHAR(80),
  "connected_at" TIMESTAMPTZ(3),
  "last_heartbeat_at" TIMESTAMPTZ(3),
  "revision" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "whatsapp_session_states_pkey" PRIMARY KEY ("tenant_id"),
  CONSTRAINT "whatsapp_session_states_state_check" CHECK ("state" IN ('starting', 'connecting', 'qr_required', 'connected', 'reconnecting', 'paused', 'logged_out', 'bad_session', 'disconnected', 'shutting_down'))
);

CREATE TABLE "safety_control_states" (
  "tenant_id" UUID NOT NULL,
  "sending_paused" BOOLEAN NOT NULL DEFAULT false,
  "kill_switch" BOOLEAN NOT NULL DEFAULT false,
  "risk_level" VARCHAR(24) NOT NULL DEFAULT 'low',
  "reason" VARCHAR(500),
  "changed_by" UUID,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "safety_control_states_pkey" PRIMARY KEY ("tenant_id"),
  CONSTRAINT "safety_control_states_risk_level_check" CHECK ("risk_level" IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT "safety_control_states_revision_check" CHECK ("revision" >= 0)
);

ALTER TABLE "whatsapp_session_states" ADD CONSTRAINT "whatsapp_session_states_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "safety_control_states" ADD CONSTRAINT "safety_control_states_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
