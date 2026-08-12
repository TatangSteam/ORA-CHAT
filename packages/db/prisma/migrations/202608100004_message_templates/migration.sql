CREATE TABLE "message_templates" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "name" VARCHAR(160) NOT NULL,
  "category" VARCHAR(64) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'inactive',
  "current_version" INTEGER NOT NULL DEFAULT 1,
  "created_by_user_id" UUID NOT NULL REFERENCES "admin_users"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_templates_status_check" CHECK ("status" IN ('active', 'inactive', 'archived')),
  CONSTRAINT "message_templates_version_check" CHECK ("current_version" > 0)
);
CREATE UNIQUE INDEX "message_templates_tenant_active_name_key"
  ON "message_templates" ("tenant_id", lower("name")) WHERE "status" <> 'archived';
CREATE INDEX "message_templates_tenant_status_updated_idx"
  ON "message_templates" ("tenant_id", "status", "updated_at" DESC, "id");

CREATE TABLE "message_template_versions" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "template_id" UUID NOT NULL REFERENCES "message_templates"("id") ON DELETE RESTRICT,
  "version" INTEGER NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
  "body" VARCHAR(4096) NOT NULL,
  "variable_schema" JSONB NOT NULL,
  "created_by_user_id" UUID NOT NULL REFERENCES "admin_users"("id") ON DELETE RESTRICT,
  "published_by_user_id" UUID REFERENCES "admin_users"("id") ON DELETE RESTRICT,
  "published_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_template_versions_template_version_key" UNIQUE ("template_id", "version"),
  CONSTRAINT "message_template_versions_version_check" CHECK ("version" > 0),
  CONSTRAINT "message_template_versions_status_check" CHECK ("status" IN ('draft', 'published', 'retired')),
  CONSTRAINT "message_template_versions_publish_check" CHECK (
    ("status" = 'draft' AND "published_at" IS NULL AND "published_by_user_id" IS NULL)
    OR ("status" IN ('published', 'retired') AND "published_at" IS NOT NULL AND "published_by_user_id" IS NOT NULL)
  )
);
CREATE INDEX "message_template_versions_tenant_template_created_idx"
  ON "message_template_versions" ("tenant_id", "template_id", "created_at" DESC, "id");

CREATE TABLE "template_checklist_items" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "template_version_id" UUID NOT NULL REFERENCES "message_template_versions"("id") ON DELETE RESTRICT,
  "sequence" INTEGER NOT NULL,
  "label" VARCHAR(240) NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "template_checklist_items_version_sequence_key" UNIQUE ("template_version_id", "sequence"),
  CONSTRAINT "template_checklist_items_sequence_check" CHECK ("sequence" BETWEEN 0 AND 100)
);
CREATE INDEX "template_checklist_items_tenant_version_sequence_idx"
  ON "template_checklist_items" ("tenant_id", "template_version_id", "sequence");

CREATE TABLE "message_template_snapshots" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "message_id" UUID NOT NULL UNIQUE REFERENCES "messages"("id") ON DELETE RESTRICT,
  "source_template_version_id" UUID NOT NULL REFERENCES "message_template_versions"("id") ON DELETE RESTRICT,
  "rendered_body" VARCHAR(4096) NOT NULL,
  "resolved_variables" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "message_template_snapshots_tenant_created_idx"
  ON "message_template_snapshots" ("tenant_id", "created_at" DESC, "id");

CREATE TABLE "message_checklist_item_snapshots" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "template_snapshot_id" UUID NOT NULL REFERENCES "message_template_snapshots"("id") ON DELETE RESTRICT,
  "source_checklist_item_id" UUID REFERENCES "template_checklist_items"("id") ON DELETE RESTRICT,
  "sequence" INTEGER NOT NULL,
  "label" VARCHAR(240) NOT NULL,
  "required" BOOLEAN NOT NULL,
  "checked" BOOLEAN NOT NULL DEFAULT false,
  "checked_by_user_id" UUID REFERENCES "admin_users"("id") ON DELETE RESTRICT,
  "checked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_checklist_snapshots_snapshot_sequence_key" UNIQUE ("template_snapshot_id", "sequence"),
  CONSTRAINT "message_checklist_snapshots_checked_actor_check" CHECK (
    ("checked" = false AND "checked_at" IS NULL AND "checked_by_user_id" IS NULL)
    OR ("checked" = true AND "checked_at" IS NOT NULL AND "checked_by_user_id" IS NOT NULL)
  )
);
CREATE INDEX "message_checklist_snapshots_tenant_snapshot_sequence_idx"
  ON "message_checklist_item_snapshots" ("tenant_id", "template_snapshot_id", "sequence");

CREATE OR REPLACE FUNCTION protect_published_template_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('published', 'retired') AND (
    NEW.body IS DISTINCT FROM OLD.body
    OR NEW.variable_schema IS DISTINCT FROM OLD.variable_schema
    OR NEW.template_id IS DISTINCT FROM OLD.template_id
    OR NEW.version IS DISTINCT FROM OLD.version
  ) THEN
    RAISE EXCEPTION 'published template version is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "message_template_versions_published_immutable"
BEFORE UPDATE ON "message_template_versions"
FOR EACH ROW EXECUTE FUNCTION protect_published_template_version();

CREATE OR REPLACE FUNCTION protect_published_template_checklist()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_status VARCHAR(24);
BEGIN
  SELECT "status" INTO version_status FROM "message_template_versions"
    WHERE "id" = COALESCE(OLD."template_version_id", NEW."template_version_id");
  IF version_status IN ('published', 'retired') THEN
    RAISE EXCEPTION 'published template checklist is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "template_checklist_published_immutable"
BEFORE UPDATE OR DELETE ON "template_checklist_items"
FOR EACH ROW EXECUTE FUNCTION protect_published_template_checklist();

CREATE OR REPLACE FUNCTION reject_message_template_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER "message_template_snapshots_append_only"
BEFORE UPDATE OR DELETE ON "message_template_snapshots"
FOR EACH ROW EXECUTE FUNCTION reject_message_template_snapshot_mutation();

CREATE TRIGGER "message_checklist_snapshots_append_only"
BEFORE UPDATE OR DELETE ON "message_checklist_item_snapshots"
FOR EACH ROW EXECUTE FUNCTION reject_message_template_snapshot_mutation();
