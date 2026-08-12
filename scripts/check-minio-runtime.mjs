import { spawnSync } from 'node:child_process';
import process from 'node:process';

const compose = (args) => {
  const result = spawnSync('docker', ['compose', '--env-file', '.env.example', ...args], {
    encoding: 'utf8'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'MinIO smoke failed');
  return result.stdout.trim();
};

const uid = compose(['exec', '-T', 'minio', 'id', '-u']);
if (uid !== '1000') throw new Error(`MinIO must run as UID 1000, received ${uid}`);

compose(['up', '-d', '--force-recreate', 'minio-init']);
let status;
for (let attempt = 0; attempt < 50; attempt += 1) {
  status = compose(['ps', '-a', '--format', 'json'])
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .find(({ Service }) => Service === 'minio-init');
  if (status?.State === 'exited') break;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
}
if (status?.State !== 'exited' || status.ExitCode !== 0) {
  throw new Error('Idempotent MinIO bootstrap did not exit successfully');
}

const smokeOutput = compose([
  'run',
  '--rm',
  '--no-deps',
  '--entrypoint',
  '/bootstrap/smoke.sh',
  'minio-init'
]);
const smoke = JSON.parse(smokeOutput.split('\n').at(-1));
if (!smoke.leastPrivilege || !smoke.versioning || !smoke.lifecycle || !smoke.iam) {
  throw new Error('MinIO capability smoke returned an invalid result');
}

process.stdout.write(
  `${JSON.stringify({ ...smoke, bootstrapIdempotent: true, nonRootUid: 1000 })}\n`
);
