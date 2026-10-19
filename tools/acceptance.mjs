#!/usr/bin/env node
// Fast acceptance: builds impls/ from the current checkout, starts the api, a dedicated fuzz instance
// and the web UI against fresh databases, and runs every suite once (public api, invariants, holdout,
// fuzz, public UI, holdout UI). Exits non-zero if any test fails or a gray-box test is skipped.
//
//   node tools/acceptance.mjs [--repeat N] [--out DIR]
//
// --repeat runs the whole thing N times, each on fresh databases (the nightly flakiness check).
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, assertNoProxy, freshDb, log, runSuites, startApi, startWeb } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const REPEAT = Number(opt('repeat', '1'));
const OUT = join(REPO, opt('out', 'reports/raw/acceptance'));
const API_DIR = join(REPO, 'impls', 'api');
const WEB_DIR = join(REPO, 'impls', 'web');
const API_BIN = join(API_DIR, 'target', 'release', 'shortlink-api');
const PORTS = { api: 8280, fuzz: 8281, web: 3200 };
const DB = { main: 'tbv_acc', fuzz: 'tbv_acc_fuzz' };

function build() {
  const env = { ...process.env, SQLX_OFFLINE: 'true', PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH}` };
  delete env.DATABASE_URL;
  log('build api');
  let r = spawnSync('cargo', ['build', '--release', '--quiet'], { cwd: API_DIR, env, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('cargo build failed');
  log('build web');
  r = spawnSync('pnpm', ['build'], { cwd: WEB_DIR, env: { ...process.env, API_URL: `http://localhost:${PORTS.api}` }, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('pnpm build failed');
}

async function once(i) {
  const dir = join(OUT, `run-${i}`);
  mkdirSync(dir, { recursive: true });
  freshDb(DB.main);
  freshDb(DB.fuzz);
  const procs = [];
  try {
    procs.push(await startApi(API_BIN, { port: PORTS.api, db: DB.main, logFile: join(dir, 'api.log') }));
    procs.push(await startApi(API_BIN, { port: PORTS.fuzz, db: DB.fuzz, logFile: join(dir, 'fuzz-api.log') }));
    procs.push(await startWeb(WEB_DIR, { port: PORTS.web, apiPort: PORTS.api, logFile: join(dir, 'web.log') }));
    return runSuites(['api', 'invariants', 'holdout', 'fuzz', 'ui', 'holdout-ui'], {
      api: `http://localhost:${PORTS.api}`,
      web: `http://localhost:${PORTS.web}`,
      fuzzApi: `http://localhost:${PORTS.fuzz}`,
      db: DB.main,
      apiBin: API_BIN,
    }, dir);
  } finally {
    for (const p of procs) p.stop();
    await new Promise((s) => setTimeout(s, 1000));
    spawnSync('sh', ['-c', `find "${dir}" -name '*.log' -exec gzip -9f {} +`]);
  }
}

async function main() {
  assertNoProxy();
  build();
  const summary = [];
  for (let i = 1; i <= REPEAT; i++) {
    log(`acceptance run ${i}/${REPEAT}`);
    const { rows } = await once(i);
    const failed = rows.filter((r) => r.state === 'failed');
    const graySkipped = rows.filter((r) => r.state === 'skipped' && r.gray);
    const passed = rows.filter((r) => r.state === 'passed').length;
    summary.push({ run: i, passed, failed: failed.map((r) => r.key), graySkipped: graySkipped.map((r) => `${r.key} (${r.note})`) });
    log(`  ${passed} passed, ${failed.length} failed, ${graySkipped.length} gray-box skipped`);
    for (const f of failed) log(`  FAIL ${f.key}: ${f.errors[0] ?? ''}`);
  }
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  const bad = summary.some((s) => s.failed.length || s.graySkipped.length);
  log(bad ? 'acceptance FAILED' : `acceptance passed (${REPEAT} run(s))`);
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
