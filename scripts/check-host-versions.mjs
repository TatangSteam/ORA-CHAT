import { spawnSync } from 'node:child_process';
import process from 'node:process';

const command = (args) => {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `docker ${args.join(' ')} failed`);
  return result.stdout.trim();
};

const [client, server] = command([
  'version',
  '--format',
  '{{.Client.Version}} {{.Server.Version}}'
]).split(' ');
const compose = command(['compose', 'version', '--short']);
const expected = { client: '29.6.2', compose: '5.3.1', server: '29.6.2' };
const actual = { client, compose, server };

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  process.stderr.write(`${JSON.stringify({ actual, expected, status: 'failed' }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ actual, status: 'passed' })}\n`);
