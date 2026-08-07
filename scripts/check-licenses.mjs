import { Buffer } from 'node:buffer';
import process from 'node:process';

const chunks = [];

for await (const chunk of process.stdin) {
  chunks.push(chunk);
}

const rawReport = Buffer.concat(chunks).toString('utf8').trim();

if (!rawReport) {
  throw new Error('License scan did not produce JSON output');
}

const report = JSON.parse(rawReport);
const forbiddenLicensePatterns = [
  /commercial/i,
  /proprietary/i,
  /see license/i,
  /unlicensed/i,
  /unknown/i
];
const rejectedLicenses = Object.keys(report).filter((license) =>
  forbiddenLicensePatterns.some((pattern) => pattern.test(license))
);

if (rejectedLicenses.length > 0) {
  throw new Error(`Rejected or unresolved licenses: ${rejectedLicenses.join(', ')}`);
}

const packages = new Set();

for (const entries of Object.values(report)) {
  for (const entry of entries) {
    for (const version of entry.versions) {
      packages.add(`${entry.name}@${version}`);
    }
  }
}

process.stdout.write(
  `${JSON.stringify(
    {
      licenseGroups: Object.keys(report).sort(),
      packageCount: packages.size,
      status: 'passed'
    },
    null,
    2
  )}\n`
);
