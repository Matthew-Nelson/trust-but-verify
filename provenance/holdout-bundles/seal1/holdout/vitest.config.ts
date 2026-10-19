import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Hidden holdout suite. It must sit next to harness/ (it reuses harness/lib). Run it with
// `pnpm test:holdout` in harness/, which links holdout/node_modules to harness/node_modules.
const here = dirname(fileURLToPath(import.meta.url));
const harness = join(here, '..', 'harness');

export default defineConfig({
  test: {
    root: here,
    projects: [
      {
        test: {
          name: 'holdout-api',
          root: here,
          include: ['api/**/*.test.ts'],
          setupFiles: [join(harness, 'lib/setup.ts')],
          globalSetup: [join(harness, 'lib/global-setup.ts')],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          maxConcurrency: 12,
          pool: 'forks',
        },
      },
      {
        test: {
          name: 'holdout-invariants',
          root: here,
          include: ['invariants/**/*.test.ts'],
          setupFiles: [join(harness, 'lib/setup.ts')],
          fileParallelism: false,
          testTimeout: 300_000,
          pool: 'forks',
        },
      },
    ],
    reporters: ['default', ['json', { outputFile: join(harness, 'results', 'holdout.json') }]],
  },
});
