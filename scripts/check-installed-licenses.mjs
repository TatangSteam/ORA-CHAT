import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';

const virtualStore = 'node_modules/.pnpm';
if (!existsSync(virtualStore)) throw new Error('pnpm virtual store is unavailable');
const manifests = new Map();
const addManifest = (path) => {
  if (!existsSync(path)) return;
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (manifest.name && manifest.version)
    manifests.set(`${manifest.name}@${manifest.version}`, { manifest, directory: dirname(path) });
};

const licenseFromFile = (directory) => {
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING']) {
    const path = `${directory}/${name}`;
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8').slice(0, 4000);
    if (/MIT License|Permission is hereby granted/iu.test(text)) return 'MIT';
    if (/Apache License\s+Version 2/iu.test(text)) return 'Apache-2.0';
    if (/ISC License/iu.test(text)) return 'ISC';
    if (/Mozilla Public License.*2\.0/isu.test(text)) return 'MPL-2.0';
    if (/GNU AFFERO GENERAL PUBLIC LICENSE.*Version 3/isu.test(text)) return 'AGPL-3.0';
    if (/BSD/iu.test(text)) return 'BSD';
  }
  return null;
};

for (const entry of readdirSync(virtualStore, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const modules = `${virtualStore}/${entry.name}/node_modules`;
  if (!existsSync(modules)) continue;
  for (const dependency of readdirSync(modules, { withFileTypes: true })) {
    if (!dependency.isDirectory()) continue;
    if (dependency.name.startsWith('@')) {
      for (const scoped of readdirSync(`${modules}/${dependency.name}`, { withFileTypes: true })) {
        if (scoped.isDirectory())
          addManifest(`${modules}/${dependency.name}/${scoped.name}/package.json`);
      }
    } else addManifest(`${modules}/${dependency.name}/package.json`);
  }
}

const forbidden = /commercial|proprietary|unlicensed|unknown|see license/iu;
const unresolved = [];
const groups = new Map();
for (const [name, { manifest, directory }] of manifests) {
  const raw = manifest.license ?? manifest.licenses;
  const license =
    (typeof raw === 'string'
      ? raw
      : Array.isArray(raw)
        ? raw
            .map((item) => (typeof item === 'string' ? item : item?.type))
            .filter(Boolean)
            .join(' OR ')
        : raw?.type) ?? licenseFromFile(directory);
  if (!license || forbidden.test(license)) unresolved.push(`${name}:${license ?? 'missing'}`);
  groups.set(license ?? 'missing', (groups.get(license ?? 'missing') ?? 0) + 1);
}
if (unresolved.length) throw new Error(`Rejected or unresolved licenses: ${unresolved.join(', ')}`);
process.stdout.write(
  `${JSON.stringify(
    {
      licenseGroups: Object.fromEntries(
        [...groups].sort(([left], [right]) => left.localeCompare(right))
      ),
      packageCount: manifests.size,
      source: 'installed pnpm transitive graph',
      status: 'passed'
    },
    null,
    2
  )}\n`
);
