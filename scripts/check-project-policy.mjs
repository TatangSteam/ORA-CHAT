import { readFileSync, readdirSync } from 'node:fs';
import process from 'node:process';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const manifestPaths = [
  'package.json',
  ...['apps', 'packages'].flatMap((directory) =>
    readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${directory}/${entry.name}/package.json`)
  )
];
const violations = [];

for (const path of manifestPaths) {
  const manifest = readJson(path);

  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      const isWorkspaceDependency = version === 'workspace:*';
      const isExactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version);

      if (!isWorkspaceDependency && !isExactVersion) {
        violations.push(`${path}:${field}:${name}=${version}`);
      }
    }
  }
}

const rootManifest = readJson('package.json');

if (rootManifest.packageManager !== 'pnpm@11.20.0') {
  violations.push(`packageManager must be pnpm@11.20.0, got ${rootManifest.packageManager}`);
}

const workflow = readFileSync('.github/workflows/quality.yml', 'utf8');
const actionReferences = [...workflow.matchAll(/uses:\s+[^@\s]+@([^\s#]+)/gu)].map(
  (match) => match[1]
);

if (actionReferences.length === 0) {
  violations.push('CI workflow must use at least one action');
}

for (const reference of actionReferences) {
  if (!/^[0-9a-f]{40}$/u.test(reference)) {
    violations.push(`CI action is not pinned to a commit SHA: ${reference}`);
  }
}

if (/continue-on-error|\|\|\s*true|echo\s+pass/iu.test(workflow)) {
  violations.push('CI workflow contains a bypass or placeholder success');
}

if (violations.length > 0) {
  process.stderr.write(`${violations.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify(
      {
        actionReferences: actionReferences.length,
        manifests: manifestPaths.length,
        status: 'passed'
      },
      null,
      2
    )}\n`
  );
}
