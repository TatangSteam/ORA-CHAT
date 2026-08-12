CREATE TABLE "tenants" (
  "id" UUID NOT NULL,
  "slug" VARCHAR(64) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenants_status_check" CHECK ("status" IN ('active', 'suspended', 'disabled'))
);

CREATE TABLE "admin_users" (
  "id" UUID NOT NULL,
  "username" VARCHAR(64) NOT NULL,
  "password_hash" VARCHAR(512) NOT NULL,
  "display_name" VARCHAR(160) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'active',
  "last_login_at" TIMESTAMPTZ(3),
  "password_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_users_status_check" CHECK ("status" IN ('active', 'locked', 'disabled'))
);

CREATE TABLE "admin_tenant_memberships" (
  "id" UUID NOT NULL,
  "admin_user_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "role" VARCHAR(32) NOT NULL,
  "permission_overrides" JSONB NOT NULL DEFAULT '{"grant":[],"deny":[]}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "admin_tenant_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_tenant_memberships_role_check" CHECK ("role" IN ('viewer', 'operator', 'admin', 'super_admin')),
  CONSTRAINT "admin_tenant_memberships_overrides_check" CHECK (
    jsonb_typeof("permission_overrides") = 'object'
    AND jsonb_typeof("permission_overrides"->'grant') = 'array'
    AND jsonb_typeof("permission_overrides"->'deny') = 'array'
  )
);

CREATE TABLE "admin_sessions" (
  "id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "admin_user_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "csrf_secret_hash" CHAR(64) NOT NULL,
  "ip_hash" CHAR(64) NOT NULL,
  "user_agent_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  "revoked_reason" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_sessions_expiry_check" CHECK ("idle_expires_at" <= "expires_at")
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "action" VARCHAR(96) NOT NULL,
  "entity_type" VARCHAR(80) NOT NULL,
  "entity_id" VARCHAR(160),
  "reason" VARCHAR(500),
  "request_id" VARCHAR(80) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");
CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");
CREATE UNIQUE INDEX "admin_tenant_memberships_admin_user_id_tenant_id_key" ON "admin_tenant_memberships"("admin_user_id", "tenant_id");
CREATE UNIQUE INDEX "admin_tenant_memberships_id_admin_user_id_tenant_id_key" ON "admin_tenant_memberships"("id", "admin_user_id", "tenant_id");
CREATE INDEX "admin_tenant_memberships_tenant_id_role_id_idx" ON "admin_tenant_memberships"("tenant_id", "role", "id");
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");
CREATE INDEX "admin_sessions_admin_user_id_revoked_at_expires_at_idx" ON "admin_sessions"("admin_user_id", "revoked_at", "expires_at");
CREATE INDEX "admin_sessions_tenant_id_revoked_at_expires_at_idx" ON "admin_sessions"("tenant_id", "revoked_at", "expires_at");
CREATE INDEX "audit_logs_tenant_id_created_at_id_idx" ON "audit_logs"("tenant_id", "created_at" DESC, "id");
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at" DESC);

ALTER TABLE "admin_tenant_memberships" ADD CONSTRAINT "admin_tenant_memberships_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admin_tenant_memberships" ADD CONSTRAINT "admin_tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_membership_context_fkey" FOREIGN KEY ("membership_id", "admin_user_id", "tenant_id") REFERENCES "admin_tenant_memberships"("id", "admin_user_id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION reject_audit_log_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;

CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION reject_audit_log_mutation();
