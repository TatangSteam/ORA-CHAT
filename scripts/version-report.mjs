import { readFileSync, readdirSync } from 'node:fs';
import process from 'node:process';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const rootManifest = readJson('package.json');
const expectedNode = readFileSync('.node-version', 'utf8').trim();
const expectedPnpm = rootManifest.packageManager.replace('pnpm@', '');
const pnpmUserAgent = process.env.npm_config_user_agent ?? '';
const actualPnpm = /pnpm\/([^\s]+)/u.exec(pnpmUserAgent)?.[1] ?? 'unknown';
const actualNode = process.versions.node;

const workspaceManifests = ['apps', 'packages'].flatMap((directory) =>
  readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readJson(`${directory}/${entry.name}/package.json`))
);
const selectedPackages = new Map();

for (const manifest of [rootManifest, ...workspaceManifests]) {
  for (const field of ['dependencies', 'devDependencies']) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      if (!version.startsWith('workspace:')) {
        selectedPackages.set(name, version);
      }
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  runtime: {
    node: {
      actual: actualNode,
      expected: expectedNode,
      matches: actualNode === expectedNode
    },
    pnpm: {
      actual: actualPnpm,
      expected: expectedPnpm,
      matches: actualPnpm === expectedPnpm
    }
  },
  packages: Object.fromEntries(
    [...selectedPackages].sort(([left], [right]) => left.localeCompare(right))
  ),
  workspaceCount: workspaceManifests.length + 1
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (
  process.argv.includes('--check') &&
  (!report.runtime.node.matches || !report.runtime.pnpm.matches)
) {
  process.stderr.write('Runtime version does not match the approved baseline.\n');
  process.exitCode = 1;
}
