import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { TARGET_WEB } from '../harness/lib/config.ts';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: join(here, 'ui'),
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list'], ['json', { outputFile: join(here, '..', 'harness', 'results', 'holdout-ui.json') }]],
  use: { ...devices['Desktop Chrome'], baseURL: TARGET_WEB },
});
