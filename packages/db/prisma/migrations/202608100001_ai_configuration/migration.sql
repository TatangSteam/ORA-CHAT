CREATE TABLE "ai_provider_credentials" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "provider_binding" VARCHAR(32) NOT NULL,
  "purpose" VARCHAR(16) NOT NULL,
  "encrypted_ciphertext" BYTEA NOT NULL,
  "encrypted_data_key" BYTEA NOT NULL,
  "nonce" BYTEA NOT NULL,
  "encryption_algorithm" VARCHAR(32) NOT NULL DEFAULT 'AES-256-GCM',
  "master_key_version" VARCHAR(32) NOT NULL,
  "secret_fingerprint" VARCHAR(32) NOT NULL,
  "rotated_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ai_provider_credentials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_provider_credentials_purpose_check" CHECK ("purpose" IN ('chat', 'embedding')),
  CONSTRAINT "ai_provider_credentials_algorithm_check" CHECK ("encryption_algorithm" = 'AES-256-GCM')
);

CREATE TABLE "ai_provider_connections" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "credential_id" UUID,
  "name" VARCHAR(160) NOT NULL,
  "purpose" VARCHAR(16) NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "transport" VARCHAR(24) NOT NULL,
  "base_url" VARCHAR(2048),
  "model_id" VARCHAR(191) NOT NULL,
  "dimensions" INTEGER,
  "task_type" VARCHAR(64),
  "timeout_ms" INTEGER NOT NULL DEFAULT 15000,
  "max_retries" INTEGER NOT NULL DEFAULT 0,
  "max_output_tokens" INTEGER NOT NULL DEFAULT 512,
  "generation_config" JSONB NOT NULL DEFAULT '{}',
  "capability_snapshot" JSONB NOT NULL DEFAULT '{}',
  "health_state" VARCHAR(32) NOT NULL DEFAULT 'not_tested',
  "last_test_error_code" VARCHAR(64),
  "last_tested_at" TIMESTAMPTZ(3),
  "tested_revision" INTEGER,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ai_provider_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_provider_connections_purpose_check" CHECK ("purpose" IN ('chat', 'embedding')),
  CONSTRAINT "ai_provider_connections_provider_check" CHECK ("provider" IN ('mock', 'openai', 'anthropic', 'gemini', 'openai-compatible', 'openclaw-gateway')),
  CONSTRAINT "ai_provider_connections_transport_check" CHECK ("transport" IN ('native', 'compatible', 'gateway')),
  CONSTRAINT "ai_provider_connections_health_check" CHECK ("health_state" IN ('not_tested', 'ready', 'reachable', 'unauthorized', 'forbidden', 'quota_exceeded', 'rate_limited', 'model_not_found', 'incompatible', 'timeout', 'blocked_url', 'unavailable')),
  CONSTRAINT "ai_provider_connections_limits_check" CHECK ("timeout_ms" BETWEEN 1000 AND 60000 AND "max_retries" BETWEEN 0 AND 2 AND "max_output_tokens" BETWEEN 16 AND 32768),
  CONSTRAINT "ai_provider_connections_dimensions_check" CHECK ("dimensions" IS NULL OR "dimensions" BETWEEN 1 AND 16384),
  CONSTRAINT "ai_provider_connections_anthropic_embedding_check" CHECK (NOT ("provider" = 'anthropic' AND "purpose" = 'embedding')),
  CONSTRAINT "ai_provider_connections_native_url_check" CHECK (NOT ("provider" IN ('openai', 'anthropic', 'gemini', 'mock')) OR "base_url" IS NULL),
  CONSTRAINT "ai_provider_connections_custom_url_check" CHECK ("provider" NOT IN ('openai-compatible', 'openclaw-gateway') OR "base_url" IS NOT NULL),
  CONSTRAINT "ai_provider_connections_generation_check" CHECK (jsonb_typeof("generation_config") = 'object' AND jsonb_typeof("capability_snapshot") = 'object')
);

CREATE TABLE "embedding_index_versions" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "provider_connection_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "model_id" VARCHAR(191) NOT NULL,
  "dimensions" INTEGER NOT NULL,
  "distance_metric" VARCHAR(24) NOT NULL DEFAULT 'cosine',
  "state" VARCHAR(24) NOT NULL DEFAULT 'building',
  "total_chunks" INTEGER NOT NULL DEFAULT 0,
  "embedded_chunks" INTEGER NOT NULL DEFAULT 0,
  "activated_at" TIMESTAMPTZ(3),
  "retired_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "embedding_index_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "embedding_index_versions_state_check" CHECK ("state" IN ('building', 'ready', 'active', 'failed', 'retired')),
  CONSTRAINT "embedding_index_versions_metric_check" CHECK ("distance_metric" IN ('cosine', 'inner_product', 'l2')),
  CONSTRAINT "embedding_index_versions_progress_check" CHECK ("version" > 0 AND "dimensions" > 0 AND "total_chunks" >= 0 AND "embedded_chunks" BETWEEN 0 AND "total_chunks")
);

CREATE TABLE "ai_integrations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "active_chat_connection_id" UUID,
  "active_embedding_connection_id" UUID,
  "active_embedding_index_version_id" UUID,
  "generation_enabled" BOOLEAN NOT NULL DEFAULT false,
  "retrieval_enabled" BOOLEAN NOT NULL DEFAULT false,
  "strict_grounding" BOOLEAN NOT NULL DEFAULT true,
  "status" VARCHAR(24) NOT NULL DEFAULT 'inactive',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ai_integrations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_integrations_status_check" CHECK ("status" IN ('inactive', 'configured', 'active')),
  CONSTRAINT "ai_integrations_revision_check" CHECK ("revision" >= 0)
);

CREATE TABLE "ai_model_capability_cache" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "connection_id" UUID NOT NULL,
  "model_id" VARCHAR(191) NOT NULL,
  "capabilities" JSONB NOT NULL,
  "source" VARCHAR(32) NOT NULL,
  "probed_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_model_capability_cache_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_model_capability_cache_json_check" CHECK (jsonb_typeof("capabilities") = 'object')
);

CREATE UNIQUE INDEX "ai_provider_connections_tenant_id_name_key" ON "ai_provider_connections"("tenant_id", "name");
CREATE UNIQUE INDEX "ai_provider_connections_id_tenant_id_purpose_key" ON "ai_provider_connections"("id", "tenant_id", "purpose");
CREATE INDEX "ai_provider_connections_tenant_id_purpose_health_state_id_idx" ON "ai_provider_connections"("tenant_id", "purpose", "health_state", "id");
CREATE INDEX "ai_provider_credentials_tenant_id_provider_binding_purpose_revoked_at_idx" ON "ai_provider_credentials"("tenant_id", "provider_binding", "purpose", "revoked_at");
CREATE UNIQUE INDEX "embedding_index_versions_tenant_id_version_key" ON "embedding_index_versions"("tenant_id", "version");
CREATE UNIQUE INDEX "embedding_index_versions_one_active" ON "embedding_index_versions"("tenant_id") WHERE "state" = 'active';
CREATE INDEX "embedding_index_versions_tenant_id_state_version_idx" ON "embedding_index_versions"("tenant_id", "state", "version" DESC);
CREATE UNIQUE INDEX "ai_integrations_tenant_id_name_key" ON "ai_integrations"("tenant_id", "name");
CREATE UNIQUE INDEX "ai_integrations_one_active" ON "ai_integrations"("tenant_id") WHERE "status" = 'active';
CREATE INDEX "ai_integrations_tenant_id_status_id_idx" ON "ai_integrations"("tenant_id", "status", "id");
CREATE UNIQUE INDEX "ai_model_capability_cache_connection_id_model_id_key" ON "ai_model_capability_cache"("connection_id", "model_id");
CREATE INDEX "ai_model_capability_cache_tenant_id_expires_at_idx" ON "ai_model_capability_cache"("tenant_id", "expires_at");

ALTER TABLE "ai_provider_credentials" ADD CONSTRAINT "ai_provider_credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_provider_connections" ADD CONSTRAINT "ai_provider_connections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_provider_connections" ADD CONSTRAINT "ai_provider_connections_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "ai_provider_credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "embedding_index_versions" ADD CONSTRAINT "embedding_index_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "embedding_index_versions" ADD CONSTRAINT "embedding_index_versions_provider_connection_id_fkey" FOREIGN KEY ("provider_connection_id") REFERENCES "ai_provider_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_integrations" ADD CONSTRAINT "ai_integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_integrations" ADD CONSTRAINT "ai_integrations_active_chat_connection_id_fkey" FOREIGN KEY ("active_chat_connection_id") REFERENCES "ai_provider_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_integrations" ADD CONSTRAINT "ai_integrations_active_embedding_connection_id_fkey" FOREIGN KEY ("active_embedding_connection_id") REFERENCES "ai_provider_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_integrations" ADD CONSTRAINT "ai_integrations_active_embedding_index_version_id_fkey" FOREIGN KEY ("active_embedding_index_version_id") REFERENCES "embedding_index_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_model_capability_cache" ADD CONSTRAINT "ai_model_capability_cache_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_model_capability_cache" ADD CONSTRAINT "ai_model_capability_cache_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "ai_provider_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
