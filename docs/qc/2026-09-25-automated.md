# Automated QC — 25 September 2026

Scope: current working tree, including existing uncommitted changes. Executed from `/Users/mac/myData/ORA-CHAT` on macOS using Node `26.7.0` and pnpm `11.20.0`. No product-code fixes were made.

## Results

| Exact command | Result | Evidence |
| --- | --- | --- |
| `corepack pnpm policy:check` | PASS | 13 manifests; 3 pinned CI action references. |
| `corepack pnpm format:check` | PASS | All matched files use Prettier style. |
| `corepack pnpm lint` | FAIL | 2 `no-undef` errors, 0 warnings, in the knowledge import script. |
| `corepack pnpm typecheck` | PASS | All 12 workspace projects completed. |
| `corepack pnpm test:unit` | PASS | 150 tests, 29 files. |
| `corepack pnpm test:integration` | PASS | 14 tests, 4 files. |
| `corepack pnpm test:security` | PASS | 18 tests, 5 files. These overlap the unit/integration suites. |
| `corepack pnpm license:scan` | PASS | 518 installed packages; scanner found no rejected/unresolved license declarations. |
| `corepack pnpm version:check` | FAIL | Node actual `26.7.0`, expected `24.18.0`; pnpm actual/expected `11.20.0`. |
| `corepack pnpm build` | PASS | All 12 workspace projects; Next.js generated 22/22 static pages, including `/agents`. |

Unit and integration suites cover 164 distinct tests. The security run is a separately executed subset; its 18 passes must not be added to that distinct-test total. These passes were obtained on the host runtime, which is outside the approved Node version range.

## Actionable findings

### Medium — ESLint blocks the normal quality gate

`scripts/import-raho-google-search-knowledge.mjs:578` and `:678` call `console.log` without importing `console` or declaring the Node global for ESLint. `eslint.config.mjs:8` enables the recommended rules, and its script-file configuration does not define that global. Both calls produce `'console' is not defined  no-undef`.

Impact: `corepack pnpm lint` exits 1. The `check` chain (`package.json:15`) therefore stops before later tests/build; fixing the runtime alone will not make `check:ci` pass. A narrow fix is to import the required Node console API or use the established script output convention; then rerun lint. This is a lint-policy failure, not evidence that Node lacks `console` at runtime.

### Medium — Host runtime fails the approved version gate

`package.json:10` requires Node `>=24.18.0 <25`, `.node-version:1` pins `24.18.0`, and `scripts/version-report.mjs:35` checks an exact match. The host reports `26.7.0`; `corepack pnpm version:check` exits 1. `package.json:16` runs this gate first in `check:ci`.

Use the approved Node `24.18.0` toolchain and rerun the version/quality gates. Passing tests/build on Node 26 do not establish the approved baseline result. This finding concerns the host environment; container runtime verification is separate.

## Test isolation and execution notes

- Inspected every integration test file and Vitest include configuration before execution. Authentication tests use `MemoryRepository` (`apps/api/src/auth.integration.test.ts:27`) and create ephemeral HTTP servers on `127.0.0.1` (`:179`). Other integration tests use mock API repositories or mocked WhatsApp internal callbacks. These suites did not connect to the live PostgreSQL database or WhatsApp session and did not send real messages.
- The first unit attempt was sandbox-blocked at `apps/api/src/ai-provider.test.ts:121`: localhost `listen EPERM`, 149 passed/1 timed out. The approved rerun allowing its ephemeral localhost mock server passed all 150. This is an execution-environment failure, not a product test failure.
- The first lint attempt overlapped Prisma generation from the typecheck script and hit a transient generated-file `ENOENT`. Lint was rerun after typecheck completed; the definitive result is the two errors above. Run lint sequentially with commands that regenerate Prisma (`packages/db/package.json:20`).
- Typecheck/build regenerate ignored Prisma/build artifacts. Next.js production build also regenerated `apps/web/next-env.d.ts`: its pre-existing four-line diff disappeared and the file now matches HEAD. Its previous contents were not captured, so they were not guessed or restored. Other pre-existing tracked diff statistics remained unchanged. No deliberate product source edit was made.

## Coverage limits

This report covers the listed automated gates only. It is not an approval for production release or a live end-to-end certification. The security suite explicitly selects five test files (`vitest.security.config.ts:19`); it is not a dependency/container vulnerability audit. The license result reflects the repository's installed-package scanner, not a legal review.

Live database/queue/storage mutation checks, migration/recovery rehearsals, smoke scripts, sending a WhatsApp message, QR pairing/reconnect, and real paid AI-provider requests were not run by this automated-check task. Browser/UI, read-only live probes, dependency audit and container scans are handled separately in the full QC report.
