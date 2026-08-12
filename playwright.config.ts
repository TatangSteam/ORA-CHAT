import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/playwright',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 8_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
      threshold: 0.2
    }
  },
  snapshotPathTemplate: '{testDir}/../../gate-a/visual-baseline/{arg}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    browserName: 'chromium',
    channel: 'chrome',
    colorScheme: 'dark',
    locale: 'id-ID',
    trace: 'retain-on-failure'
  }
});
