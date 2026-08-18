CREATE TABLE "knowledge_lexical_chunks" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL,
  "document_id" UUID,
  "item_version_id" UUID,
  "sequence" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "content_hash" CHAR(64) NOT NULL,
  "token_estimate" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_lexical_chunks_one_source_check"
    CHECK (("document_id" IS NOT NULL)::int + ("item_version_id" IS NOT NULL)::int = 1),
  CONSTRAINT "knowledge_lexical_chunks_sequence_check"
    CHECK ("sequence" >= 0 AND "token_estimate" >= 0)
);

CREATE UNIQUE INDEX "knowledge_lexical_chunks_source_sequence_key"
  ON "knowledge_lexical_chunks"(
    "tenant_id",
    COALESCE("document_id", '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("item_version_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "sequence"
  );
CREATE INDEX "knowledge_lexical_chunks_tenant_id_idx"
  ON "knowledge_lexical_chunks"("tenant_id", "id");
CREATE INDEX "knowledge_lexical_chunks_content_fts_idx"
  ON "knowledge_lexical_chunks" USING GIN (to_tsvector('simple', "content"));

ALTER TABLE "knowledge_lexical_chunks"
  ADD CONSTRAINT "knowledge_lexical_chunks_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_lexical_chunks"
  ADD CONSTRAINT "knowledge_lexical_chunks_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_lexical_chunks"
  ADD CONSTRAINT "knowledge_lexical_chunks_item_version_id_fkey"
  FOREIGN KEY ("item_version_id") REFERENCES "knowledge_item_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "knowledge_lexical_chunks"
  ("id", "tenant_id", "document_id", "item_version_id", "sequence", "content",
   "content_hash", "token_estimate", "created_at")
SELECT c."id", c."tenant_id", c."document_id", c."item_version_id", c."sequence",
       c."content", c."content_hash", c."token_estimate", c."created_at"
FROM "knowledge_chunks" c
JOIN "embedding_index_versions" i ON i."id" = c."index_version_id"
WHERE i."state" = 'active'
ON CONFLICT DO NOTHING;

ALTER TABLE "ai_message_sources" ALTER COLUMN "chunk_id" DROP NOT NULL;
ALTER TABLE "ai_message_sources" ADD COLUMN "lexical_chunk_id" UUID;
ALTER TABLE "ai_message_sources"
  ADD CONSTRAINT "ai_message_sources_one_source_check"
  CHECK (("chunk_id" IS NOT NULL)::int + ("lexical_chunk_id" IS NOT NULL)::int = 1);
ALTER TABLE "ai_message_sources"
  ADD CONSTRAINT "ai_message_sources_lexical_chunk_id_fkey"
  FOREIGN KEY ("lexical_chunk_id") REFERENCES "knowledge_lexical_chunks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ai_message_sources_trace_lexical_chunk_key"
  ON "ai_message_sources"("trace_id", "lexical_chunk_id");
