import { defineConfig, devices } from '@playwright/test';
import { TARGET_WEB } from './lib/config.ts';

// UI suite (R-UI-*). Serial: SPEC "Scheduling" forbids running it concurrently with the bulk-create
// test or list-order tests, and the "Your links" table is shared state.
export default defineConfig({
  testDir: 'tests/ui',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['json', { outputFile: 'results/ui.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: TARGET_WEB,
    trace: 'retain-on-failure',
  },
});
