#!/usr/bin/env node
// Mutant runner. For each patch in mutants/: reset a worktree to impl-v1, apply the patch, build,
// start the service against fresh databases, run the suites, and classify the mutant as killed or
// survived against clean baseline runs of the same pipeline.
//
//   node tools/mutate.mjs [--out DIR] [--baseline N] [--only 01,07] [--skip-baseline-from DIR]
//
// Api mutants run: public api, invariants, holdout (api + invariants) and fuzz.
// Web mutants run: public UI and holdout UI, against a clean api.
// A test that failed in ANY baseline run is "unstable" and never counts as a kill.
// One worktree at a fixed path (.work/mutant-wt) is reused, so the api binary keeps one path.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { basename, join } from 'node:path';
import { REPO, assertNoProxy, freshDb, log, runSuites, startApi, startWeb } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const OUT = join(REPO, opt('out', 'reports/raw/mutants/run-0'));
const BASELINES = Number(opt('baseline', '3'));
const ONLY = opt('only', '') ? opt('only').split(',') : null;
const BASELINE_FROM = opt('skip-baseline-from', null);
const WT = join(REPO, '.work', 'mutant-wt');
const API_BIN = join(WT, 'impls', 'api', 'target', 'release', 'shortlink-api');
const WEB = join(WT, 'impls', 'web');
const PORTS = { api: 8180, fuzz: 8181, web: 3100 };
const DB = { main: 'tbv_mut', fuzz: 'tbv_mut_fuzz' };
const TAG = 'impl-v1';
// The newest harness tag reachable from HEAD: which frozen harness this round measured.
const HARNESS_TAG = spawnSync('git', ['-C', REPO, 'describe', '--tags', '--abbrev=0', '--match', 'harness-v*'], { encoding: 'utf8' }).stdout.trim() || null;
// Where the round ran: race-dependent kills (R-ALIAS-5) have differed between a laptop and a CI runner.
const HOST = { where: process.env.GITHUB_ACTIONS ? 'GitHub Actions' : 'local', platform: process.platform, arch: process.arch, cpus: cpus().length };

function sh(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });
  return { ok: r.status === 0, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

function prepareWorktree() {
  if (!existsSync(WT)) {
    mkdirSync(join(REPO, '.work'), { recursive: true });
    const r = sh('git', ['-C', REPO, 'worktree', 'add', '--detach', WT, TAG]);
    if (!r.ok) throw new Error(r.out);
  }
}

function resetWorktree() {
  // Keeps ignored build outputs (target/, node_modules/, .next/) so builds stay incremental.
  for (const a of [['reset', '-q', '--hard', TAG], ['clean', '-fdq', '--', 'impls']]) {
    const r = sh('git', ['-C', WT, ...a]);
    if (!r.ok) throw new Error(r.out);
  }
}

function buildApi(logFile) {
  const env = { ...process.env, SQLX_OFFLINE: 'true', PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH}` };
  delete env.DATABASE_URL;
  const r = sh('cargo', ['build', '--release', '--quiet'], { cwd: join(WT, 'impls', 'api'), env });
  writeFileSync(logFile, r.out);
  return r.ok;
}

function buildWeb(logFile) {
  if (!existsSync(join(WEB, 'node_modules'))) {
    const i = sh('pnpm', ['install', '--frozen-lockfile'], { cwd: WEB, env: { ...process.env, CI: 'true' } });
    if (!i.ok) {
      writeFileSync(logFile, i.out);
      return false;
    }
  }
  const r = sh('pnpm', ['build'], { cwd: WEB, env: { ...process.env, API_URL: `http://localhost:${PORTS.api}` } });
  writeFileSync(logFile, r.out);
  return r.ok;
}

function mutantMeta(file) {
  const text = readFileSync(file, 'utf8');
  const header = text.split(/^diff --git /m)[0];
  const id = (header.match(/R-[A-Z]+-\d+/) ?? text.match(/R-[A-Z]+-\d+/) ?? [null])[0];
  const kind = /^diff --git a\/impls\/web\//m.test(text) ? 'web' : 'api';
  return { name: basename(file, '.patch'), file, id, kind };
}

/** One pipeline run: optional patch, build, services, suites. Returns { status, rows }. */
async function runJob(label, kind, patch) {
  const dir = join(OUT, label);
  mkdirSync(dir, { recursive: true });
  resetWorktree();
  if (patch) {
    const r = sh('git', ['-C', WT, 'apply', patch]);
    if (!r.ok) return { status: 'apply-failed', detail: r.out, rows: [] };
  }
  if (!buildApi(join(dir, 'build-api.log'))) return { status: 'build-failed', detail: 'cargo build failed', rows: [] };
  if (kind === 'web' && !buildWeb(join(dir, 'build-web.log'))) return { status: 'build-failed', detail: 'pnpm build failed', rows: [] };
  freshDb(DB.main);
  freshDb(DB.fuzz);
  const procs = [];
  try {
    procs.push(await startApi(API_BIN, { port: PORTS.api, db: DB.main, logFile: join(dir, 'api.log') }));
    let suites;
    const targets = { api: `http://localhost:${PORTS.api}`, db: DB.main, apiBin: API_BIN };
    if (kind === 'api') {
      procs.push(await startApi(API_BIN, { port: PORTS.fuzz, db: DB.fuzz, logFile: join(dir, 'fuzz-api.log') }));
      targets.fuzzApi = `http://localhost:${PORTS.fuzz}`;
      suites = ['api', 'invariants', 'holdout', 'fuzz'];
    } else {
      procs.push(await startWeb(WEB, { port: PORTS.web, apiPort: PORTS.api, logFile: join(dir, 'web.log') }));
      targets.web = `http://localhost:${PORTS.web}`;
      suites = ['ui', 'holdout-ui'];
    }
    const { rows, exits } = runSuites(suites, targets, dir);
    return { status: 'ran', rows, exits };
  } catch (e) {
    return { status: 'start-failed', detail: String(e.message ?? e), rows: [] };
  } finally {
    for (const p of procs) p.stop();
    await new Promise((s) => setTimeout(s, 1000));
    // Logs are evidence but large; keep them compressed (zcat / rg -z read them).
    sh('sh', ['-c', `find "${dir}" -name '*.log' -exec gzip -9f {} +`]);
  }
}

function summarize(rows) {
  const c = { passed: 0, failed: 0, skipped: 0 };
  for (const r of rows) c[r.state]++;
  return c;
}

async function main() {
  assertNoProxy();
  prepareWorktree();
  mkdirSync(OUT, { recursive: true });
  const patches = readdirSync(join(REPO, 'mutants')).filter((f) => f.endsWith('.patch')).sort();
  const mutants = patches.map((f) => mutantMeta(join(REPO, 'mutants', f))).filter((m) => !ONLY || ONLY.some((o) => m.name.startsWith(o)));

  // Baselines: clean impl-v1 through the same pipeline, for each kind that is needed.
  const baseline = { api: [], web: [] };
  const kinds = [...new Set(mutants.map((m) => m.kind))];
  if (BASELINE_FROM) {
    Object.assign(baseline, JSON.parse(readFileSync(join(REPO, BASELINE_FROM, 'baseline.json'), 'utf8')));
  } else {
    for (const kind of kinds) {
      for (let i = 1; i <= BASELINES; i++) {
        log(`baseline ${kind} ${i}/${BASELINES}`);
        const r = await runJob(`baseline-${kind}-${i}`, kind, null);
        if (r.status !== 'ran') throw new Error(`baseline ${kind} ${i} ${r.status}: ${r.detail}`);
        log(`  ${JSON.stringify(summarize(r.rows))}`);
        baseline[kind].push(r.rows.map((x) => ({ key: x.key, state: x.state })));
      }
    }
    writeFileSync(join(OUT, 'baseline.json'), JSON.stringify(baseline));
  }
  const unstable = {};
  const alwaysPassed = {};
  for (const kind of Object.keys(baseline)) {
    unstable[kind] = new Set(baseline[kind].flatMap((run) => run.filter((x) => x.state === 'failed').map((x) => x.key)));
    const counts = new Map();
    for (const run of baseline[kind]) for (const x of run) if (x.state === 'passed') counts.set(x.key, (counts.get(x.key) ?? 0) + 1);
    alwaysPassed[kind] = new Set([...counts].filter(([, n]) => n === baseline[kind].length).map(([k]) => k));
  }

  const results = [];
  for (const m of mutants) {
    log(`mutant ${m.name} (${m.kind}, ${m.id})`);
    const r = await runJob(m.name, m.kind, m.file);
    let verdict = r.status;
    let killers = [];
    let unstableFailures = [];
    if (r.status === 'ran') {
      const failed = r.rows.filter((x) => x.state === 'failed');
      killers = failed.filter((x) => alwaysPassed[m.kind].has(x.key) && !unstable[m.kind].has(x.key));
      unstableFailures = failed.filter((x) => !killers.includes(x));
      verdict = killers.length ? 'killed' : 'survived';
    }
    const targeted = killers.some((k) => k.ids.includes(m.id));
    const bySuite = {};
    for (const k of killers) bySuite[k.suite] = (bySuite[k.suite] ?? 0) + 1;
    const res = {
      mutant: m.name,
      id: m.id,
      kind: m.kind,
      verdict,
      targeted: verdict === 'killed' ? targeted : null,
      killersBySuite: bySuite,
      killers: killers.map((k) => ({ suite: k.suite, name: k.name, ids: k.ids, error: k.errors[0] ?? '' })),
      unstableFailures: unstableFailures.map((k) => k.key),
      detail: r.detail ?? null,
    };
    results.push(res);
    log(`  -> ${verdict}${verdict === 'killed' ? (targeted ? ' (targeted)' : ' (incidental)') : ''} ${JSON.stringify(bySuite)}`);
    writeFileSync(join(OUT, 'results.json'), JSON.stringify({ tag: TAG, harnessTag: HARNESS_TAG, host: HOST, baselines: BASELINES, unstable: Object.fromEntries(Object.entries(unstable).map(([k, v]) => [k, [...v]])), results }, null, 1));
  }
  resetWorktree();
  const killed = results.filter((r) => r.verdict === 'killed');
  log(`done: ${killed.length}/${results.length} killed, ${killed.filter((r) => r.targeted).length} targeted`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
