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
      '@raho/storage': fileURLToPath(new URL('./packages/storage/src/index.ts', import.meta.url)),
      '@raho/testing': fileURLToPath(new URL('./packages/testing/src/index.ts', import.meta.url)),
      '@raho/ui': fileURLToPath(new URL('./packages/ui/src/index.ts', import.meta.url))
    }
  },
  test: {
    coverage: {
      enabled: false
    },
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/*.integration.test.ts'],
    passWithNoTests: false
  }
});
