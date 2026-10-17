import { defineConfig } from 'vitest/config';

// Invariants (R-LINK-6, R-ALIAS-5, R-REDIR-5). Files run one at a time, and this suite must not
// run concurrently with the UI suite or the list-order tests (SPEC "Scheduling").
export default defineConfig({
  test: {
    include: ['tests/invariants/**/*.test.ts'],
    setupFiles: ['lib/setup.ts'],
    globalSetup: ['lib/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 60_000,
    pool: 'forks',
    reporters: ['default', ['json', { outputFile: 'results/invariants.json' }]],
  },
});
