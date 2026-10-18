#!/usr/bin/env node
// R-OAS-1: Schemathesis against spec/openapi.json, following SPEC "Verification rules / Fuzzing":
//   - Schemathesis version pinned below (the harness's lock for the Python side)
//   - every check that version provides except positive_data_acceptance
//   - positive and negative modes (--mode all), fixed seed, >= 100 examples per operation
//   - redirects are not followed (--max-redirects 0)
//   - format validation off for URL-valued fields: `format: uri` is stripped from a derived copy of the
//     schema (Schemathesis only offers a global switch, and date/date-time formats must stay checked;
//     openapi v1.1 no longer carries any `format: uri`, so the strip is kept only as a guard)
//   - run against a DEDICATED api instance + database: FUZZ_API (falls back to TARGET_API with a warning)
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMATHESIS = 'schemathesis==4.29.1';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'fuzz', 'out');
mkdirSync(out, { recursive: true });

const env = process.env;
const target = (env.FUZZ_API || env.TARGET_API || 'http://localhost:8080').replace(/\/+$/, '');
const seed = env.FUZZ_SEED || '20261017';
const examples = env.FUZZ_MAX_EXAMPLES || '100';
if (!env.FUZZ_API) {
  console.warn(`[fuzz] FUZZ_API is unset; using ${target}. SPEC requires a dedicated api instance and database for this run.`);
}

// Derived schema: identical to spec/openapi.json except `format: "uri"` removed (URL-valued fields).
const spec = JSON.parse(readFileSync(join(root, '..', 'spec', 'openapi.json'), 'utf8'));
const stripped = [];
(function strip(node, path) {
  if (Array.isArray(node)) return node.forEach((v, i) => strip(v, `${path}/${i}`));
  if (node && typeof node === 'object') {
    if (node.format === 'uri') {
      delete node.format;
      stripped.push(path);
    }
    for (const [k, v] of Object.entries(node)) strip(v, `${path}/${k}`);
  }
})(spec, '#');
const schemaPath = join(out, 'openapi.fuzz.json');
writeFileSync(schemaPath, JSON.stringify(spec, null, 2));

const args = [
  '--from', SCHEMATHESIS, 'schemathesis', 'run', schemaPath,
  '--url', target,
  '--checks', 'all',
  '--exclude-checks', 'positive_data_acceptance',
  '--mode', 'all',
  '--seed', seed,
  '--max-examples', examples,
  '--max-redirects', '0',
  '--request-timeout', '10',
  '--report', 'junit,ndjson',
  '--report-dir', out,
];
const summary = [
  `schemathesis: ${SCHEMATHESIS}`,
  `target: ${target}`,
  `seed: ${seed}`,
  `max-examples per operation: ${examples}`,
  `checks: all except positive_data_acceptance`,
  `mode: all (positive + negative); redirects not followed`,
  `format "uri" stripped at: ${stripped.join(', ') || '(none)'}`,
  `command: uvx ${args.join(' ')}`,
].join('\n');
console.log(summary + '\n');
const t0 = Date.now();
const r = spawnSync('uvx', args, { stdio: 'inherit', env: { ...env, SCHEMATHESIS_HOOKS: '' } });
writeFileSync(join(out, 'summary.txt'), `${summary}\nexit: ${r.status}\nduration: ${Math.round((Date.now() - t0) / 1000)} s\n`);
process.exit(r.status ?? 1);
