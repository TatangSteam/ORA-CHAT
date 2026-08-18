import { mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
};

const version = run('docker', ['scout', 'version']);
if (version.status !== 0) {
  throw new Error('Docker Scout is required for the container vulnerability gate');
}

const composeImages = run('docker', [
  'compose',
  '--env-file',
  '.env.example',
  'config',
  '--images'
]);
if (composeImages.status !== 0) {
  throw new Error(composeImages.stderr || 'Unable to resolve Compose images');
}

const images = [
  ...new Set(
    composeImages.stdout
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean)
  )
];
rmSync('test-results/container-scan', { recursive: true, force: true });
mkdirSync('test-results/container-scan', { recursive: true });

const failures = [];
for (const [index, image] of images.entries()) {
  const report = `test-results/container-scan/image-${index + 1}.md`;
  const result = run('docker', [
    'scout',
    'cves',
    '--exit-code',
    '--only-severity',
    'critical,high',
    '--format',
    'markdown',
    '--output',
    report,
    `local://${image}`
  ]);
  if (result.status !== 0) failures.push({ image, report, status: result.status });
}

if (failures.length > 0) {
  process.stderr.write(`${JSON.stringify({ failures, status: 'failed' }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(
  `${JSON.stringify({ images: images.length, reports: 'test-results/container-scan', status: 'passed' })}\n`
);
