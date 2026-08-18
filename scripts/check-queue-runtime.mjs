import { spawnSync } from 'node:child_process';
import process from 'node:process';

const compose = (args) => {
  const result = spawnSync('docker', ['compose', '--env-file', '.env.example', ...args], {
    encoding: 'utf8'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Queue smoke failed');
  return result.stdout.trim();
};

const first = JSON.parse(
  compose(['exec', '-T', 'worker', '/nodejs/bin/node', 'packages/queue/dist/smoke.js'])
);
if (!first.deterministicId || first.status !== 'passed') throw new Error('Queue smoke was invalid');

compose(['restart', 'redis', 'worker']);
const recovered = JSON.parse(
  compose(['exec', '-T', 'worker', '/nodejs/bin/node', 'packages/queue/dist/smoke.js'])
);
if (!recovered.deterministicId || recovered.status !== 'passed') {
  throw new Error('Queue restart recovery failed');
}

process.stdout.write(
  `${JSON.stringify({ deterministicJobId: true, restartRecovery: true, status: 'passed' })}\n`
);
