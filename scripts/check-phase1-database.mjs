import { spawnSync } from 'node:child_process';
import process from 'node:process';

const psql = (sql) => {
  const result = spawnSync(
    'docker',
    [
      'compose',
      '--env-file',
      '.env.example',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'raho_app',
      '-d',
      'raho_chatbot',
      '-Atc',
      sql
    ],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
};

const checks = {
  migrations: psql('SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL'),
  pgvector: psql("SELECT extversion FROM pg_extension WHERE extname = 'vector'"),
  phase1Tables: psql(
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('tenants','admin_users','admin_tenant_memberships','admin_sessions','audit_logs','whatsapp_session_states','safety_control_states')"
  ),
  phase2Tables: psql(
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('contacts','conversations','messages','message_events','outbox_messages','idempotency_keys','handoff_tasks','chatbot_rule_versions','chatbot_rules')"
  ),
  phase3Tables: psql(
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('ai_integrations','ai_provider_credentials','ai_provider_connections','ai_model_capability_cache','embedding_index_versions')"
  ),
  phase4Tables: psql(
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('knowledge_categories','knowledge_items','knowledge_item_versions','knowledge_question_variants','knowledge_documents','knowledge_storage_objects','knowledge_chunks','ai_prompt_versions','ai_message_traces','ai_message_sources','ai_embedding_usage_logs','ai_response_cache')"
  ),
  phase5Tables: psql(
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('ai_admin_feedback','unanswered_questions','unanswered_question_occurrences','ai_test_cases','ai_test_runs','ai_release_readiness','ai_evaluation_reports','ai_operational_alerts')"
  ),
  phase6Tables: psql(
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('message_templates','message_template_versions','template_checklist_items','message_template_snapshots','message_checklist_item_snapshots')"
  ),
  auditTrigger: psql(
    "SELECT count(*) FROM pg_trigger WHERE tgname='audit_logs_append_only' AND tgenabled='O'"
  ),
  messageEventTrigger: psql(
    "SELECT count(*) FROM pg_trigger WHERE tgname='message_events_append_only' AND tgenabled='O'"
  ),
  knowledgeImmutableTrigger: psql(
    "SELECT count(*) FROM pg_trigger WHERE tgname='knowledge_version_immutable' AND tgenabled='O'"
  ),
  aiAppendOnlyTriggers: psql(
    "SELECT count(*) FROM pg_trigger WHERE tgname IN ('ai_trace_append_only','ai_source_append_only') AND tgenabled='O'"
  ),
  aiOperationsAppendOnlyTriggers: psql(
    "SELECT count(*) FROM pg_trigger WHERE tgname IN ('unanswered_occurrences_append_only','ai_test_runs_append_only','ai_evaluation_reports_append_only') AND tgenabled='O'"
  ),
  phase6IntegrityTriggers: psql(
    "SELECT count(*) FROM pg_trigger WHERE tgname IN ('message_template_versions_published_immutable','template_checklist_published_immutable','message_template_snapshots_append_only','message_checklist_snapshots_append_only') AND tgenabled='O'"
  ),
  scryptUsers: psql("SELECT count(*) FROM admin_users WHERE password_hash LIKE 'scrypt$v=1$%'")
};

const expected = {
  migrations: '8',
  pgvector: '0.8.6',
  phase1Tables: '7',
  phase2Tables: '9',
  phase3Tables: '5',
  phase4Tables: '12',
  phase5Tables: '8',
  phase6Tables: '5',
  auditTrigger: '1',
  messageEventTrigger: '1',
  knowledgeImmutableTrigger: '1',
  aiAppendOnlyTriggers: '2',
  aiOperationsAppendOnlyTriggers: '3',
  phase6IntegrityTriggers: '4'
};
for (const [name, value] of Object.entries(expected)) {
  if (checks[name] !== value)
    throw new Error(`${name} expected ${value}, received ${checks[name]}`);
}
if (Number(checks.scryptUsers) < 1) throw new Error('No scrypt-backed bootstrap user found');

psql(`DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    UPDATE audit_logs SET action = 'tamper-attempt' WHERE id = (SELECT id FROM audit_logs LIMIT 1);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'audit_logs is append-only' THEN blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'append-only trigger did not block mutation'; END IF;
END $$`);

psql(`DO $$
DECLARE
  version_blocked boolean := false;
  checklist_blocked boolean := false;
  snapshot_blocked boolean := false;
  item_snapshot_blocked boolean := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM message_template_snapshots) THEN
    RAISE EXCEPTION 'Phase 6 snapshot evidence is missing';
  END IF;
  BEGIN
    UPDATE message_template_versions SET body = body || ' tamper'
      WHERE id = (SELECT id FROM message_template_versions WHERE status IN ('published','retired') LIMIT 1);
  EXCEPTION WHEN raise_exception THEN version_blocked := true;
  END;
  BEGIN
    UPDATE template_checklist_items SET label = label || ' tamper'
      WHERE id = (SELECT i.id FROM template_checklist_items i JOIN message_template_versions v ON v.id=i.template_version_id WHERE v.status IN ('published','retired') LIMIT 1);
  EXCEPTION WHEN raise_exception THEN checklist_blocked := true;
  END;
  BEGIN
    UPDATE message_template_snapshots SET rendered_body = rendered_body || ' tamper'
      WHERE id = (SELECT id FROM message_template_snapshots LIMIT 1);
  EXCEPTION WHEN raise_exception THEN snapshot_blocked := true;
  END;
  BEGIN
    UPDATE message_checklist_item_snapshots SET checked = false
      WHERE id = (SELECT id FROM message_checklist_item_snapshots LIMIT 1);
  EXCEPTION WHEN raise_exception THEN item_snapshot_blocked := true;
  END;
  IF NOT version_blocked OR NOT checklist_blocked OR NOT snapshot_blocked OR NOT item_snapshot_blocked THEN
    RAISE EXCEPTION 'Phase 6 immutable trigger did not block mutation';
  END IF;
END $$`);

process.stdout.write(
  `${JSON.stringify({
    auditAppendOnly: 'passed',
    migrations: Number(checks.migrations),
    pgvector: checks.pgvector,
    phase1Tables: Number(checks.phase1Tables),
    phase2Tables: Number(checks.phase2Tables),
    phase3Tables: Number(checks.phase3Tables),
    phase4Tables: Number(checks.phase4Tables),
    phase5Tables: Number(checks.phase5Tables),
    phase6Tables: Number(checks.phase6Tables),
    knowledgeImmutable: 'passed',
    aiTraceAppendOnly: 'passed',
    aiOperationsAppendOnly: 'passed',
    phase6Integrity: 'passed',
    status: 'passed'
  })}\n`
);
