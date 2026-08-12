CREATE TABLE "knowledge_categories" (
  "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "parent_id" UUID,
  "name" VARCHAR(160) NOT NULL, "slug" VARCHAR(80) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "knowledge_categories_revision_check" CHECK ("revision" >= 0)
);

CREATE TABLE "knowledge_items" (
  "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "category_id" UUID,
  "title" VARCHAR(240) NOT NULL, "current_version_id" UUID, "published_version_id" UUID,
  "status" VARCHAR(24) NOT NULL DEFAULT 'draft', "revision" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "knowledge_items_status_check" CHECK ("status" IN ('draft','in_review','approved','published','archived')),
  CONSTRAINT "knowledge_items_revision_check" CHECK ("revision" >= 0)
);

CREATE TABLE "knowledge_item_versions" (
  "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "item_id" UUID NOT NULL,
  "version" INTEGER NOT NULL, "answer" TEXT NOT NULL, "content_hash" CHAR(64) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
  "created_by_user_id" UUID, "approved_by_user_id" UUID, "published_by_user_id" UUID,
  "approved_at" TIMESTAMPTZ(3), "published_at" TIMESTAMPTZ(3), "archived_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "knowledge_item_versions_status_check" CHECK ("status" IN ('draft','in_review','approved','published','archived')),
  CONSTRAINT "knowledge_item_versions_version_check" CHECK ("version" > 0)
);

CREATE TABLE "knowledge_question_variants" (
  "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "item_version_id" UUID NOT NULL,
  "question" VARCHAR(500) NOT NULL, "normalized_question" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "knowledge_documents" (
  "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL,
  "original_filename" VARCHAR(255) NOT NULL, "declared_mime" VARCHAR(160) NOT NULL,
  "detected_mime" VARCHAR(160), "byte_size" BIGINT NOT NULL, "sha256" CHAR(64) NOT NULL,
  "state" VARCHAR(24) NOT NULL DEFAULT 'uploaded', "failure_code" VARCHAR(80),
  "retry_count" INTEGER NOT NULL DEFAULT 0, "revision" INTEGER NOT NULL DEFAULT 0,
  "uploaded_by_user_id" UUID, "ready_at" TIMESTAMPTZ(3), "archived_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "knowledge_documents_mime_check" CHECK ("declared_mime" IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain')),
  CONSTRAINT "knowledge_documents_state_check" CHECK ("state" IN ('uploaded','queued','extracting','cleaning','chunking','embedding','ready','failed','archived')),
  CONSTRAINT "knowledge_documents_size_check" CHECK ("byte_size" BETWEEN 1 AND 10485760),
  CONSTRAINT "knowledge_documents_revision_check" CHECK ("revision" >= 0 AND "retry_count" >= 0)
);

CREATE TABLE "knowledge_storage_objects" (
  "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "document_id" UUID NOT NULL,
  "role" VARCHAR(24) NOT NULL, "bucket" VARCHAR(80) NOT NULL, "object_key" VARCHAR(500) NOT NULL,
  "version_id" VARCHAR(191) NOT NULL, "etag" VARCHAR(191) NOT NULL,
  "byte_size" BIGINT NOT NULL, "sha256" CHAR(64) NOT NULL, "verified_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_storage_objects_role_check" CHECK ("role" IN ('quarantine','source','extracted','export')),
  CONSTRAINT "knowledge_storage_objects_key_check" CHECK ("object_key" !~ '[[:space:]@]')
);

CREATE TABLE "knowledge_chunks" (
  "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "index_version_id" UUID NOT NULL,
  "document_id" UUID, "item_version_id" UUID, "sequence" INTEGER NOT NULL,
  "content" TEXT NOT NULL, "content_hash" CHAR(64) NOT NULL,
  "token_estimate" INTEGER NOT NULL, "embedding" vector,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_chunks_one_source_check" CHECK (("document_id" IS NOT NULL)::int + ("item_version_id" IS NOT NULL)::int = 1),
  CONSTRAINT "knowledge_chunks_sequence_check" CHECK ("sequence" >= 0 AND "token_estimate" >= 0)
);

CREATE TABLE "ai_prompt_versions" (
  "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "name" VARCHAR(160) NOT NULL,
  "version" INTEGER NOT NULL, "template" TEXT NOT NULL, "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
  "revision" INTEGER NOT NULL DEFAULT 0, "created_by_user_id" UUID, "published_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ai_prompt_versions_status_check" CHECK ("status" IN ('draft','published','archived')),
  CONSTRAINT "ai_prompt_versions_numbers_check" CHECK ("version" > 0 AND "revision" >= 0)
);

CREATE TABLE "ai_message_traces" (
  "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "request_id" VARCHAR(80) NOT NULL,
  "question_hash" CHAR(64) NOT NULL, "status" VARCHAR(24) NOT NULL, "answer" TEXT NOT NULL,
  "fallback_reason" VARCHAR(80), "chat_connection_id" UUID, "embedding_index_id" UUID,
  "latency_ms" INTEGER NOT NULL, "safe_metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_message_traces_status_check" CHECK ("status" IN ('answered','fallback','handoff')),
  CONSTRAINT "ai_message_traces_metadata_check" CHECK (jsonb_typeof("safe_metadata") = 'object' AND "latency_ms" >= 0)
);

CREATE TABLE "ai_message_sources" (
  "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "trace_id" UUID NOT NULL,
  "chunk_id" UUID NOT NULL, "rank" INTEGER NOT NULL, "score" DOUBLE PRECISION NOT NULL,
  "label" VARCHAR(32) NOT NULL, "preview" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_message_sources_rank_check" CHECK ("rank" > 0 AND "score" >= -1 AND "score" <= 1)
);

CREATE TABLE "ai_embedding_usage_logs" (
  "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "connection_id" UUID NOT NULL,
  "operation" VARCHAR(32) NOT NULL, "item_count" INTEGER NOT NULL, "token_count" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_embedding_usage_counts_check" CHECK ("item_count" >= 0 AND ("token_count" IS NULL OR "token_count" >= 0))
);

CREATE TABLE "ai_response_cache" (
  "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "cache_key" CHAR(64) NOT NULL,
  "answer" TEXT NOT NULL, "source_snapshot" JSONB NOT NULL, "index_version_id" UUID NOT NULL,
  "prompt_version" VARCHAR(80) NOT NULL, "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_response_cache_sources_check" CHECK (jsonb_typeof("source_snapshot") = 'array')
);

CREATE UNIQUE INDEX "knowledge_categories_tenant_id_slug_key" ON "knowledge_categories"("tenant_id","slug");
CREATE INDEX "knowledge_categories_tenant_parent_name_idx" ON "knowledge_categories"("tenant_id","parent_id","name","id");
CREATE UNIQUE INDEX "knowledge_items_current_version_id_key" ON "knowledge_items"("current_version_id");
CREATE UNIQUE INDEX "knowledge_items_published_version_id_key" ON "knowledge_items"("published_version_id");
CREATE INDEX "knowledge_items_tenant_status_updated_idx" ON "knowledge_items"("tenant_id","status","updated_at" DESC,"id");
CREATE INDEX "knowledge_items_tenant_category_title_idx" ON "knowledge_items"("tenant_id","category_id","title","id");
CREATE UNIQUE INDEX "knowledge_item_versions_item_version_key" ON "knowledge_item_versions"("item_id","version");
CREATE INDEX "knowledge_item_versions_tenant_status_published_idx" ON "knowledge_item_versions"("tenant_id","status","published_at" DESC,"id");
CREATE UNIQUE INDEX "knowledge_question_variants_version_normalized_key" ON "knowledge_question_variants"("item_version_id","normalized_question");
CREATE INDEX "knowledge_question_variants_tenant_normalized_idx" ON "knowledge_question_variants"("tenant_id","normalized_question","id");
CREATE INDEX "knowledge_documents_tenant_state_created_idx" ON "knowledge_documents"("tenant_id","state","created_at" DESC,"id");
CREATE INDEX "knowledge_documents_tenant_sha_idx" ON "knowledge_documents"("tenant_id","sha256","id");
CREATE UNIQUE INDEX "knowledge_storage_objects_bucket_key_version_key" ON "knowledge_storage_objects"("bucket","object_key","version_id");
CREATE UNIQUE INDEX "knowledge_storage_objects_document_role_key" ON "knowledge_storage_objects"("document_id","role");
CREATE INDEX "knowledge_storage_objects_tenant_document_role_idx" ON "knowledge_storage_objects"("tenant_id","document_id","role","id");
CREATE UNIQUE INDEX "knowledge_chunks_source_sequence_key" ON "knowledge_chunks"("index_version_id",COALESCE("document_id",'00000000-0000-0000-0000-000000000000'::uuid),COALESCE("item_version_id",'00000000-0000-0000-0000-000000000000'::uuid),"sequence");
CREATE INDEX "knowledge_chunks_tenant_index_idx" ON "knowledge_chunks"("tenant_id","index_version_id","id");
CREATE INDEX "knowledge_chunks_content_fts_idx" ON "knowledge_chunks" USING GIN (to_tsvector('simple',"content"));
CREATE UNIQUE INDEX "ai_prompt_versions_tenant_name_version_key" ON "ai_prompt_versions"("tenant_id","name","version");
CREATE UNIQUE INDEX "ai_prompt_versions_one_published" ON "ai_prompt_versions"("tenant_id","name") WHERE "status" = 'published';
CREATE INDEX "ai_prompt_versions_tenant_status_name_idx" ON "ai_prompt_versions"("tenant_id","status","name","version" DESC);
CREATE INDEX "ai_message_traces_tenant_created_idx" ON "ai_message_traces"("tenant_id","created_at" DESC,"id");
CREATE UNIQUE INDEX "ai_message_sources_trace_rank_key" ON "ai_message_sources"("trace_id","rank");
CREATE UNIQUE INDEX "ai_message_sources_trace_chunk_key" ON "ai_message_sources"("trace_id","chunk_id");
CREATE INDEX "ai_message_sources_tenant_trace_rank_idx" ON "ai_message_sources"("tenant_id","trace_id","rank");
CREATE INDEX "ai_embedding_usage_tenant_created_idx" ON "ai_embedding_usage_logs"("tenant_id","created_at" DESC,"id");
CREATE UNIQUE INDEX "ai_response_cache_tenant_key" ON "ai_response_cache"("tenant_id","cache_key");
CREATE INDEX "ai_response_cache_tenant_expiry_idx" ON "ai_response_cache"("tenant_id","expires_at");

ALTER TABLE "knowledge_categories" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
ALTER TABLE "knowledge_categories" ADD FOREIGN KEY ("parent_id") REFERENCES "knowledge_categories"("id") ON DELETE RESTRICT;
ALTER TABLE "knowledge_items" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
ALTER TABLE "knowledge_items" ADD FOREIGN KEY ("category_id") REFERENCES "knowledge_categories"("id") ON DELETE RESTRICT;
ALTER TABLE "knowledge_item_versions" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
ALTER TABLE "knowledge_item_versions" ADD FOREIGN KEY ("item_id") REFERENCES "knowledge_items"("id") ON DELETE RESTRICT;
ALTER TABLE "knowledge_items" ADD FOREIGN KEY ("current_version_id") REFERENCES "knowledge_item_versions"("id") ON DELETE RESTRICT;
ALTER TABLE "knowledge_items" ADD FOREIGN KEY ("published_version_id") REFERENCES "knowledge_item_versions"("id") ON DELETE RESTRICT;
ALTER TABLE "knowledge_question_variants" ADD FOREIGN KEY ("item_version_id") REFERENCES "knowledge_item_versions"("id") ON DELETE RESTRICT;
ALTER TABLE "knowledge_documents" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
ALTER TABLE "knowledge_storage_objects" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
ALTER TABLE "knowledge_storage_objects" ADD FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE RESTRICT;
ALTER TABLE "knowledge_chunks" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
ALTER TABLE "knowledge_chunks" ADD FOREIGN KEY ("index_version_id") REFERENCES "embedding_index_versions"("id") ON DELETE RESTRICT;
ALTER TABLE "knowledge_chunks" ADD FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE RESTRICT;
ALTER TABLE "knowledge_chunks" ADD FOREIGN KEY ("item_version_id") REFERENCES "knowledge_item_versions"("id") ON DELETE RESTRICT;
ALTER TABLE "ai_prompt_versions" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
ALTER TABLE "ai_message_traces" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
ALTER TABLE "ai_message_sources" ADD FOREIGN KEY ("trace_id") REFERENCES "ai_message_traces"("id") ON DELETE RESTRICT;
ALTER TABLE "ai_message_sources" ADD FOREIGN KEY ("chunk_id") REFERENCES "knowledge_chunks"("id") ON DELETE RESTRICT;
ALTER TABLE "ai_embedding_usage_logs" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
ALTER TABLE "ai_response_cache" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

CREATE FUNCTION reject_published_knowledge_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'published' AND (NEW.answer <> OLD.answer OR NEW.content_hash <> OLD.content_hash) THEN
    RAISE EXCEPTION 'published knowledge versions are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER knowledge_version_immutable BEFORE UPDATE ON "knowledge_item_versions"
FOR EACH ROW EXECUTE FUNCTION reject_published_knowledge_mutation();

CREATE FUNCTION reject_ai_trace_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'AI traces and citations are append-only'; END;
$$;
CREATE TRIGGER ai_trace_append_only BEFORE UPDATE OR DELETE ON "ai_message_traces"
FOR EACH ROW EXECUTE FUNCTION reject_ai_trace_mutation();
CREATE TRIGGER ai_source_append_only BEFORE UPDATE OR DELETE ON "ai_message_sources"
FOR EACH ROW EXECUTE FUNCTION reject_ai_trace_mutation();
