#!/usr/bin/env node
// Runs the hidden holdout suite, which is kept outside harness/. It is expected at ../holdout, or at HOLDOUT_DIR.
// The holdout reuses harness/lib and harness/node_modules (linked in as holdout/node_modules).
// The API and invariant projects run first; the UI part runs unless HOLDOUT_SKIP_UI=1.
// Like test:invariants, run it alone: not at the same time as the UI suite or the list-order tests.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const harness = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const holdout = resolve(env.HOLDOUT_DIR || join(harness, '..', 'holdout'));
if (!existsSync(join(holdout, 'vitest.config.ts'))) {
  console.error(`[holdout] no holdout suite at ${holdout} (it is distributed separately; set HOLDOUT_DIR)`);
  process.exit(2);
}
const link = join(holdout, 'node_modules');
let present = false;
try {
  lstatSync(link);
  present = true;
} catch {}
if (!present) symlinkSync(join(harness, 'node_modules'), link, 'dir');

const bin = (n) => join(harness, 'node_modules', '.bin', n);
const run = (cmd, args, extra = {}) => spawnSync(cmd, args, { stdio: 'inherit', cwd: holdout, env: { ...env, ...extra } }).status ?? 1;

let status = run(bin('vitest'), ['run', '--config', join(holdout, 'vitest.config.ts')]);
if (env.HOLDOUT_SKIP_UI !== '1') {
  status = run(bin('playwright'), ['test', '--config', join(holdout, 'playwright.config.ts')], { PLAYWRIGHT_BROWSERS_PATH: '0' }) || status;
}
process.exit(status);
