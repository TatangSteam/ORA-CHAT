ALTER TABLE "ai_message_traces"
  ADD COLUMN "provider" VARCHAR(32),
  ADD COLUMN "transport" VARCHAR(24),
  ADD COLUMN "model_id" VARCHAR(191),
  ADD COLUMN "provider_request_id" VARCHAR(191),
  ADD COLUMN "input_tokens" INTEGER,
  ADD COLUMN "output_tokens" INTEGER,
  ADD COLUMN "cached_tokens" INTEGER,
  ADD COLUMN "cost_minor" INTEGER,
  ADD COLUMN "cost_currency" CHAR(3),
  ADD COLUMN "cache_hit" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ai_admin_feedback" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "trace_id" UUID NOT NULL REFERENCES "ai_message_traces"("id") ON DELETE RESTRICT,
  "reviewer_user_id" UUID NOT NULL REFERENCES "admin_users"("id") ON DELETE RESTRICT,
  "rating" VARCHAR(24) NOT NULL,
  "category" VARCHAR(32) NOT NULL,
  "note" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_admin_feedback_trace_reviewer_key" UNIQUE ("trace_id", "reviewer_user_id"),
  CONSTRAINT "ai_admin_feedback_rating_check" CHECK ("rating" IN ('correct', 'incorrect', 'incomplete', 'unsafe')),
  CONSTRAINT "ai_admin_feedback_category_check" CHECK ("category" IN ('correct', 'incorrect', 'incomplete', 'unsafe', 'wrong_source', 'too_long', 'too_promotional'))
);
CREATE INDEX "ai_admin_feedback_tenant_category_updated_idx"
  ON "ai_admin_feedback" ("tenant_id", "category", "updated_at" DESC, "id");

CREATE TABLE "unanswered_questions" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "normalized_question_hash" CHAR(64) NOT NULL,
  "representative_question" VARCHAR(500) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'open',
  "occurrence_count" INTEGER NOT NULL DEFAULT 1,
  "resolved_by_item_id" UUID REFERENCES "knowledge_items"("id") ON DELETE RESTRICT,
  "first_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "resolved_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "unanswered_questions_tenant_hash_key" UNIQUE ("tenant_id", "normalized_question_hash"),
  CONSTRAINT "unanswered_questions_status_check" CHECK ("status" IN ('open', 'drafted', 'resolved', 'dismissed')),
  CONSTRAINT "unanswered_questions_count_check" CHECK ("occurrence_count" > 0)
);
CREATE INDEX "unanswered_questions_tenant_status_count_idx"
  ON "unanswered_questions" ("tenant_id", "status", "occurrence_count" DESC, "last_seen_at" DESC);

CREATE TABLE "unanswered_question_occurrences" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "unanswered_question_id" UUID NOT NULL REFERENCES "unanswered_questions"("id") ON DELETE RESTRICT,
  "trace_id" UUID REFERENCES "ai_message_traces"("id") ON DELETE RESTRICT,
  "conversation_id" UUID,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "unanswered_occurrences_tenant_question_time_idx"
  ON "unanswered_question_occurrences" ("tenant_id", "unanswered_question_id", "occurred_at" DESC, "id");

CREATE TABLE "ai_test_cases" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "name" VARCHAR(160) NOT NULL,
  "input" VARCHAR(2000) NOT NULL,
  "expected_behavior" JSONB NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'active',
  "created_by_user_id" UUID NOT NULL REFERENCES "admin_users"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_test_cases_tenant_name_key" UNIQUE ("tenant_id", "name"),
  CONSTRAINT "ai_test_cases_status_check" CHECK ("status" IN ('active', 'archived'))
);
CREATE INDEX "ai_test_cases_tenant_status_updated_idx"
  ON "ai_test_cases" ("tenant_id", "status", "updated_at" DESC, "id");

CREATE TABLE "ai_test_runs" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "test_case_id" UUID NOT NULL REFERENCES "ai_test_cases"("id") ON DELETE RESTRICT,
  "integration_id" UUID NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "actual_result" JSONB NOT NULL,
  "assertion_result" JSONB NOT NULL,
  "latency_ms" INTEGER NOT NULL,
  "started_at" TIMESTAMPTZ(3) NOT NULL,
  "finished_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ai_test_runs_status_check" CHECK ("status" IN ('passed', 'failed', 'error')),
  CONSTRAINT "ai_test_runs_latency_check" CHECK ("latency_ms" >= 0)
);
CREATE INDEX "ai_test_runs_tenant_case_started_idx"
  ON "ai_test_runs" ("tenant_id", "test_case_id", "started_at" DESC, "id");
CREATE INDEX "ai_test_runs_tenant_status_started_idx"
  ON "ai_test_runs" ("tenant_id", "status", "started_at" DESC, "id");

CREATE TABLE "ai_release_readiness" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "integration_id" UUID NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(24) NOT NULL DEFAULT 'blocked',
  "gate_results" JSONB NOT NULL,
  "pilot_percentage" INTEGER NOT NULL DEFAULT 0,
  "blockers" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "decided_by_user_id" UUID REFERENCES "admin_users"("id") ON DELETE RESTRICT,
  "evaluated_at" TIMESTAMPTZ(3) NOT NULL,
  "decided_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_release_readiness_status_check" CHECK ("status" IN ('blocked', 'ready', 'approved', 'paused')),
  CONSTRAINT "ai_release_readiness_pilot_check" CHECK ("pilot_percentage" BETWEEN 0 AND 100)
);
CREATE INDEX "ai_release_readiness_tenant_evaluated_idx"
  ON "ai_release_readiness" ("tenant_id", "evaluated_at" DESC, "id");

CREATE TABLE "ai_evaluation_reports" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "readiness_id" UUID NOT NULL REFERENCES "ai_release_readiness"("id") ON DELETE RESTRICT,
  "report_type" VARCHAR(32) NOT NULL,
  "total_cases" INTEGER NOT NULL,
  "passed_cases" INTEGER NOT NULL,
  "failed_cases" INTEGER NOT NULL,
  "score" DECIMAL(5,4) NOT NULL,
  "metrics" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_evaluation_reports_counts_check" CHECK ("total_cases" >= 0 AND "passed_cases" >= 0 AND "failed_cases" >= 0),
  CONSTRAINT "ai_evaluation_reports_score_check" CHECK ("score" BETWEEN 0 AND 1)
);
CREATE INDEX "ai_evaluation_reports_tenant_created_idx"
  ON "ai_evaluation_reports" ("tenant_id", "created_at" DESC, "id");

CREATE TABLE "ai_operational_alerts" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "fingerprint" CHAR(64) NOT NULL,
  "severity" VARCHAR(16) NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "summary" VARCHAR(500) NOT NULL,
  "safe_metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" VARCHAR(24) NOT NULL DEFAULT 'open',
  "first_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "occurrence_count" INTEGER NOT NULL DEFAULT 1,
  "acknowledged_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_operational_alerts_tenant_fingerprint_key" UNIQUE ("tenant_id", "fingerprint"),
  CONSTRAINT "ai_operational_alerts_severity_check" CHECK ("severity" IN ('info', 'warning', 'critical')),
  CONSTRAINT "ai_operational_alerts_status_check" CHECK ("status" IN ('open', 'acknowledged', 'resolved'))
);
CREATE INDEX "ai_operational_alerts_tenant_status_severity_idx"
  ON "ai_operational_alerts" ("tenant_id", "status", "severity", "last_seen_at" DESC, "id");

CREATE OR REPLACE FUNCTION reject_ai_operations_history_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER "unanswered_occurrences_append_only"
BEFORE UPDATE OR DELETE ON "unanswered_question_occurrences"
FOR EACH ROW EXECUTE FUNCTION reject_ai_operations_history_mutation();

CREATE TRIGGER "ai_test_runs_append_only"
BEFORE UPDATE OR DELETE ON "ai_test_runs"
FOR EACH ROW EXECUTE FUNCTION reject_ai_operations_history_mutation();

CREATE TRIGGER "ai_evaluation_reports_append_only"
BEFORE UPDATE OR DELETE ON "ai_evaluation_reports"
FOR EACH ROW EXECUTE FUNCTION reject_ai_operations_history_mutation();
