import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@raho/ai': fileURLToPath(new URL('./packages/ai/src/index.ts', import.meta.url)),
      '@raho/config': fileURLToPath(new URL('./packages/config/src/index.ts', import.meta.url)),
      '@raho/contracts': fileURLToPath(
        new URL('./packages/contracts/src/index.ts', import.meta.url)
      ),
      '@raho/db': fileURLToPath(new URL('./packages/db/src/index.ts', import.meta.url)),
      '@raho/queue': fileURLToPath(new URL('./packages/queue/src/index.ts', import.meta.url)),
      '@raho/storage': fileURLToPath(new URL('./packages/storage/src/index.ts', import.meta.url))
    }
  },
  test: {
    include: [
      'apps/api/src/auth.integration.test.ts',
      'apps/api/src/route-policy.test.ts',
      'packages/contracts/src/messaging.test.ts',
      'packages/contracts/src/rbac.test.ts',
      'packages/db/src/password.test.ts'
    ],
    passWithNoTests: false,
    testTimeout: 30_000
  }
});
