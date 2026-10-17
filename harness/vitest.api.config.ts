import { defineConfig } from 'vitest/config';

// API acceptance suite. Files run in parallel; every test creates its own data.
export default defineConfig({
  test: {
    include: ['tests/api/**/*.test.ts'],
    setupFiles: ['lib/setup.ts'],
    globalSetup: ['lib/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    maxConcurrency: 12,
    pool: 'forks',
    reporters: ['default', ['json', { outputFile: 'results/api.json' }]],
  },
});
