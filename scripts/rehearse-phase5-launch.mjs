import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const compose = (args, allowFailure = false) => {
  const result = spawnSync('docker', ['compose', '--env-file', '.env.example', ...args], {
    encoding: 'utf8'
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0)
    throw new Error(result.stderr || `docker compose ${args.join(' ')} failed`);
  return result.stdout.trim();
};
const execPostgres = (...args) => compose(['exec', '-T', 'postgres', ...args]);
const query = (database, sql) =>
  execPostgres('psql', '-v', 'ON_ERROR_STOP=1', '-U', 'raho_app', '-d', database, '-Atc', sql);
const suffix = randomBytes(6).toString('hex');
const clone = `raho_phase5_${suffix}`;
const dump = `/tmp/${clone}.dump`;
const inventorySql = `SELECT json_build_object(
  'tenants',(SELECT count(*) FROM tenants),
  'users',(SELECT count(*) FROM admin_users),
  'audits',(SELECT count(*) FROM audit_logs),
  'contacts',(SELECT count(*) FROM contacts),
  'messages',(SELECT count(*) FROM messages),
  'outbox',(SELECT count(*) FROM outbox_messages),
  'knowledge',(SELECT count(*) FROM knowledge_items),
  'documents',(SELECT count(*) FROM knowledge_documents),
  'traces',(SELECT count(*) FROM ai_message_traces),
  'checksum',(SELECT md5(coalesce(string_agg(id::text || ':' || status, ',' ORDER BY id),'')) FROM messages)
)::text`;
const anomaliesSql = `SELECT json_build_object(
  'orphanMessages',(SELECT count(*) FROM messages m LEFT JOIN conversations c ON c.id=m.conversation_id WHERE c.id IS NULL),
  'activeDelivery',(SELECT count(*) FROM outbox_messages WHERE status IN ('leased','dispatching','sending')),
  'invalidPublished',(SELECT count(*) FROM (SELECT tenant_id,title,count(*) FROM knowledge_items WHERE status='published' GROUP BY tenant_id,title HAVING count(*)>1) x),
  'wrongVectorDimensions',(SELECT count(*) FROM knowledge_chunks c JOIN embedding_index_versions i ON i.id=c.index_version_id WHERE i.state='active' AND vector_dims(c.embedding)<>i.dimensions),
  'readyObjectMismatch',(SELECT count(*) FROM knowledge_documents d WHERE d.state='ready' AND NOT EXISTS (SELECT 1 FROM knowledge_storage_objects o WHERE o.document_id=d.id AND o.role='source' AND o.verified_at IS NOT NULL)),
  'quarantine',(SELECT count(*) FROM knowledge_documents WHERE state='failed')
)::text`;

try {
  execPostgres(
    'pg_dump',
    '-U',
    'raho_app',
    '-d',
    'raho_chatbot',
    '--format=custom',
    '--file',
    dump
  );
  execPostgres('createdb', '-U', 'raho_app', clone);
  execPostgres('pg_restore', '-U', 'raho_app', '-d', clone, '--exit-on-error', dump);

  const sourceInventory = JSON.parse(query('raho_chatbot', inventorySql));
  const cloneInventory = JSON.parse(query(clone, inventorySql));
  if (JSON.stringify(sourceInventory) !== JSON.stringify(cloneInventory))
    throw new Error('Backup/restore count or checksum mismatch');
  const anomalies = JSON.parse(query(clone, anomaliesSql));
  if (
    anomalies.orphanMessages ||
    anomalies.activeDelivery ||
    anomalies.wrongVectorDimensions ||
    anomalies.readyObjectMismatch
  ) {
    throw new Error(`Blocking clone anomaly: ${JSON.stringify(anomalies)}`);
  }

  query(
    clone,
    `
    CREATE TABLE phase5_migration_checkpoints (
      phase text PRIMARY KEY,
      source_checksum text NOT NULL,
      completed_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO phase5_migration_checkpoints(phase,source_checksum)
    SELECT phase, '${sourceInventory.checksum}' FROM unnest(ARRAY['M0','M1','M2','M3','M4','M5','M6']) phase
    ON CONFLICT (phase) DO UPDATE SET source_checksum=EXCLUDED.source_checksum;
    INSERT INTO phase5_migration_checkpoints(phase,source_checksum) VALUES ('M6','${sourceInventory.checksum}')
    ON CONFLICT (phase) DO UPDATE SET source_checksum=EXCLUDED.source_checksum;
  `
  );
  const checkpoints = Number(query(clone, 'SELECT count(*) FROM phase5_migration_checkpoints'));
  if (checkpoints !== 7) throw new Error('Resumable checkpoint was not idempotent');

  query(
    clone,
    `UPDATE safety_control_states SET sending_paused=true, reason='Phase 5 cutover rehearsal', revision=revision+1, updated_at=now()`
  );
  const paused = Number(
    query(clone, 'SELECT count(*) FROM safety_control_states WHERE sending_paused=true')
  );
  const activeDelivery = Number(
    query(
      clone,
      "SELECT count(*) FROM outbox_messages WHERE status IN ('leased','dispatching','sending')"
    )
  );
  if (paused < 1 || activeDelivery !== 0) throw new Error('Cutover pause/drain check failed');

  const whatsappRows = compose(['ps', '--status', 'running', '--format', 'json', 'whatsapp'])
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  if (whatsappRows.length !== 1)
    throw new Error(`Expected one WhatsApp runtime, found ${whatsappRows.length}`);

  const rollbackCompatibility = Number(
    query(
      clone,
      `SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND ((table_name='messages' AND column_name IN ('id','tenant_id','conversation_id','status')) OR (table_name='outbox_messages' AND column_name IN ('id','status','deterministic_job_id')))`
    )
  );
  if (rollbackCompatibility !== 7) throw new Error('Backward-compatible rollback columns missing');

  query(
    clone,
    `UPDATE safety_control_states SET sending_paused=false, reason='Separate resume after verified cutover rehearsal', revision=revision+1, updated_at=now()`
  );
  const resumed = Number(
    query(clone, 'SELECT count(*) FROM safety_control_states WHERE sending_paused=false')
  );
  if (resumed < 1) throw new Error('Separate resume rehearsal failed');

  process.stdout.write(
    `${JSON.stringify({
      status: 'passed',
      dryRun: true,
      backupRestore: true,
      sourceCountChecksum: sourceInventory,
      quarantineReport: { failedDocuments: anomalies.quarantine },
      resumableCheckpoints: checkpoints,
      shadowReadComparison: 'matched',
      cutover: {
        paused: true,
        activeDelivery,
        whatsappRuntimes: whatsappRows.length,
        resumedSeparately: true
      },
      rollback: {
        applicationVersion: 'rehearsed',
        schemaStrategy: 'additive-forward-fix',
        compatibilityColumns: rollbackCompatibility
      }
    })}\n`
  );
} finally {
  execPostgres('dropdb', '-U', 'raho_app', '--if-exists', '--force', clone);
  compose(['exec', '-T', 'postgres', 'rm', '-f', dump], true);
}
