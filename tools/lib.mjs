// Shared helpers for the verification tools: databases, starting the api and web, and running each
// suite into one normalized result format. Every result row is
//   { suite, key, name, ids, gray, state: passed|failed|skipped, note, annotations, errors }
// where `ids` are the requirement IDs in the test title.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, openSync, readFileSync, rmSync, symlinkSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { userInfo } from 'node:os';
import { gunzipSync } from 'node:zlib';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const HARNESS = join(REPO, 'harness');
export const HOLDOUT = join(REPO, 'holdout');
const BIN = (n) => join(HARNESS, 'node_modules', '.bin', n);
const REPORTER = join(REPO, 'tools', 'vitest-reporter.mjs');

export const PGUSER = process.env.PGUSER || userInfo().username;
export const dbUrl = (name) => `postgres://${PGUSER}@localhost:5432/${name}`;

/** Reads a text file, or its gzipped form (`<path>.gz`) if only that exists. Returns null if neither. */
export function readText(path) {
  if (existsSync(path)) return readFileSync(path, 'utf8');
  if (existsSync(`${path}.gz`)) return gunzipSync(readFileSync(`${path}.gz`)).toString('utf8');
  return null;
}

export function log(...a) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
}

/** Fails if proxy variables are set: Schemathesis honours them even for localhost (HR3-02). */
export function assertNoProxy() {
  const set = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY'].flatMap((v) => [v, v.toLowerCase()]).filter((v) => process.env[v]);
  if (set.length) throw new Error(`proxy variables are set (${set.join(', ')}); unset them before verifying`);
}

/** Drops and recreates a database, so every run starts empty. */
export function freshDb(name) {
  for (const sql of [`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`, `CREATE DATABASE ${name}`]) {
    const r = spawnSync('psql', ['-h', 'localhost', '-U', PGUSER, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qc', sql], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`psql failed (${sql}): ${r.stderr}`);
  }
}

async function waitFor(url, okStatuses, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url, { redirect: 'manual' });
      if (okStatuses.includes(r.status)) return true;
    } catch {}
    await new Promise((s) => setTimeout(s, 250));
  }
  return false;
}

/** Starts the api binary; resolves once /healthz answers 200. Returns { stop }. */
export async function startApi(bin, { port, db, logFile }) {
  const env = { ...process.env, DATABASE_URL: dbUrl(db), PORT: String(port), PUBLIC_BASE_URL: `http://localhost:${port}` };
  delete env.API_BIN;
  const out = openLog(logFile);
  const child = spawn(bin, [], { env, stdio: ['ignore', out, out] });
  const ok = await waitFor(`http://localhost:${port}/healthz`, [200], 30_000);
  const stop = () => stopChild(child);
  if (!ok) {
    stop();
    throw new Error(`api on :${port} did not become healthy (log: ${logFile})`);
  }
  return { stop, child };
}

/** Starts the production web build (`next start`) in webDir. */
export async function startWeb(webDir, { port, apiPort, logFile }) {
  const env = { ...process.env, API_URL: `http://localhost:${apiPort}`, PORT: String(port) };
  const out = openLog(logFile);
  const child = spawn(join(webDir, 'node_modules', '.bin', 'next'), ['start', '-p', String(port)], { cwd: webDir, env, stdio: ['ignore', out, out] });
  const ok = await waitFor(`http://localhost:${port}/`, [200], 60_000);
  const stop = () => stopChild(child);
  if (!ok) {
    stop();
    throw new Error(`web on :${port} did not start (log: ${logFile})`);
  }
  return { stop, child };
}

function openLog(file) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, '');
  return openSync(file, 'a');
}

function stopChild(child) {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
}

const ID_RE = /\[(R-[A-Z]+-\d+)\]/g;
const idsOf = (title) => [...title.matchAll(ID_RE)].map((m) => m[1]);

function normalizeVitest(suite, file) {
  if (!existsSync(file)) return [{ suite, key: `${suite}::<no results>`, name: '<suite produced no results>', ids: [], gray: false, state: 'failed', note: null, annotations: [], errors: ['no result file'] }];
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const rows = d.tests.map((t) => ({
    suite,
    key: `${suite}::${t.file}::${t.name}`,
    name: t.name,
    ids: idsOf(t.name),
    gray: /gray-box/.test(t.name) || /graybox/.test(t.file),
    state: t.state,
    note: t.note,
    annotations: t.annotations,
    errors: t.errors,
  }));
  for (const e of d.unhandledErrors) rows.push({ suite, key: `${suite}::<unhandled>::${e.slice(0, 80)}`, name: '<unhandled error>', ids: [], gray: false, state: 'failed', note: null, annotations: [], errors: [e] });
  return rows;
}

function normalizePlaywright(suite, file) {
  if (!existsSync(file)) return [{ suite, key: `${suite}::<no results>`, name: '<suite produced no results>', ids: [], gray: false, state: 'failed', note: null, annotations: [], errors: ['no result file'] }];
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const rows = [];
  const walk = (s, path) => {
    for (const spec of s.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const last = t.results?.[t.results.length - 1];
        const status = t.status === 'skipped' ? 'skipped' : t.status === 'expected' || t.status === 'flaky' ? 'passed' : 'failed';
        const name = [...path, spec.title].filter(Boolean).join(' > ');
        const skip = (t.annotations ?? []).find((a) => a.type === 'skip');
        rows.push({
          suite,
          key: `${suite}::${spec.file}::${name}`,
          name,
          ids: idsOf(spec.title),
          gray: /gray-box/.test(spec.title),
          state: status,
          note: status === 'skipped' ? (skip?.description ?? null) : null,
          annotations: (t.annotations ?? []).map((a) => `${a.type}: ${a.description ?? ''}`),
          errors: (last?.errors ?? []).map((e) => String(e.message ?? '').replace(/\x1b\[[0-9;]*m/g, '').split('\n')[0].slice(0, 400)),
          flaky: t.status === 'flaky',
        });
      }
    }
    for (const c of s.suites ?? []) walk(c, [...path, c.title && !c.title.endsWith('.ts') ? c.title : '']);
  };
  for (const s of d.suites ?? []) walk(s, []);
  return rows;
}

function runProc(cmd, args, { cwd, env, logFile, timeoutMs }) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024 });
  writeFileSync(logFile, (r.stdout ?? '') + (r.stderr ?? '') + (r.error ? `\n[runner] ${r.error.message}\n` : ''));
  return r.status ?? 1;
}

/**
 * Runs the selected suites against running services and returns normalized rows.
 * targets: { api, web, publicBase, db, fuzzApi } ; suites: subset of
 *   api, invariants, holdout, ui, holdout-ui, fuzz
 */
export function runSuites(suites, targets, outDir) {
  mkdirSync(outDir, { recursive: true });
  const env = {
    ...process.env,
    TARGET_API: targets.api,
    PUBLIC_BASE_URL: targets.publicBase ?? targets.api,
    TARGET_WEB: targets.web ?? 'http://localhost:3000',
    DATABASE_URL: dbUrl(targets.db),
    API_BIN: targets.apiBin,
    PLAYWRIGHT_BROWSERS_PATH: '0',
    FORCE_COLOR: '0',
  };
  let rows = [];
  const exits = {};
  const vitest = (suite, config, cwd) => {
    const res = join(outDir, `${suite}.json`);
    rmSync(res, { force: true });
    exits[suite] = runProc(BIN('vitest'), ['run', '--config', config, '--reporter=default', `--reporter=${REPORTER}`], {
      cwd,
      env: { ...env, TBV_RESULTS_FILE: res },
      logFile: join(outDir, `${suite}.log`),
      timeoutMs: 20 * 60_000,
    });
    rows = rows.concat(normalizeVitest(suite, res));
  };
  const playwright = (suite, config, produced) => {
    rmSync(produced, { force: true });
    exits[suite] = runProc(BIN('playwright'), ['test', '--config', config], { cwd: HARNESS, env, logFile: join(outDir, `${suite}.log`), timeoutMs: 20 * 60_000 });
    const res = join(outDir, `${suite}.json`);
    if (existsSync(produced)) writeFileSync(res, readFileSync(produced));
    rows = rows.concat(normalizePlaywright(suite, res));
  };
  ensureHoldoutLink();
  if (suites.includes('api')) vitest('api', join(HARNESS, 'vitest.api.config.ts'), HARNESS);
  if (suites.includes('invariants')) vitest('invariants', join(HARNESS, 'vitest.invariants.config.ts'), HARNESS);
  if (suites.includes('holdout')) vitest('holdout', join(HOLDOUT, 'vitest.config.ts'), HOLDOUT);
  if (suites.includes('ui')) playwright('ui', join(HARNESS, 'playwright.config.ts'), join(HARNESS, 'results', 'ui.json'));
  if (suites.includes('holdout-ui')) playwright('holdout-ui', join(HOLDOUT, 'playwright.config.ts'), join(HARNESS, 'results', 'holdout-ui.json'));
  if (suites.includes('fuzz')) rows = rows.concat(runFuzz(targets.fuzzApi, env, outDir, exits));
  writeFileSync(join(outDir, 'rows.json'), JSON.stringify({ exits, rows }, null, 1));
  return { exits, rows };
}

function ensureHoldoutLink() {
  const link = join(HOLDOUT, 'node_modules');
  try {
    lstatSync(link);
  } catch {
    symlinkSync(join(HARNESS, 'node_modules'), link, 'dir');
  }
}

/** Runs `pnpm fuzz` (harness/scripts/fuzz.mjs) and turns each failing operation into a row. */
function runFuzz(fuzzApi, env, outDir, exits) {
  const fuzzOut = join(HARNESS, 'fuzz', 'out');
  for (const f of existsSync(fuzzOut) ? readdirSync(fuzzOut) : []) if (/^(junit|ndjson)-/.test(f)) rmSync(join(fuzzOut, f));
  exits.fuzz = runProc('node', [join(HARNESS, 'scripts', 'fuzz.mjs')], {
    cwd: HARNESS,
    env: { ...env, FUZZ_API: fuzzApi, PUBLIC_BASE_URL: fuzzApi },
    logFile: join(outDir, 'fuzz.log'),
    timeoutMs: 20 * 60_000,
  });
  const junit = readdirSync(fuzzOut).find((f) => f.startsWith('junit-'));
  if (junit) writeFileSync(join(outDir, 'fuzz-junit.xml'), readFileSync(join(fuzzOut, junit)));
  const summary = existsSync(join(fuzzOut, 'summary.txt')) ? readFileSync(join(fuzzOut, 'summary.txt'), 'utf8') : '';
  writeFileSync(join(outDir, 'fuzz-summary.txt'), summary);
  const log = readFileSync(join(outDir, 'fuzz.log'), 'utf8');
  return fuzzRows(junit ? readFileSync(join(fuzzOut, junit), 'utf8') : '', exits.fuzz, log);
}

/** One row per fuzzed operation from Schemathesis's JUnit report, plus one for the run's exit status. */
export function fuzzRows(xml, exit, log) {
  const generated = log.match(/(\d+) generated, (\d+) (?:passed|found)/);
  const rows = [];
  // Passing operations are self-closing <testcase .../>; failing ones wrap <failure>/<error>.
  for (const m of xml.matchAll(/<testcase\s[^>]*?name="([^"]+)"[^>]*?(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const body = m[2] ?? '';
    const bad = /<(failure|error)/.test(body);
    const msg = (body.match(/message="([^"]*)"/) ?? [])[1] ?? '';
    rows.push({ suite: 'fuzz', key: `fuzz::${m[1]}`, name: `[R-OAS-1] fuzz ${m[1]}`, ids: ['R-OAS-1'], gray: false, state: bad ? 'failed' : 'passed', note: null, annotations: [], errors: bad ? [msg.slice(0, 400)] : [] });
  }
  rows.push({ suite: 'fuzz', key: 'fuzz::<exit>', name: '[R-OAS-1] fuzz run exit status', ids: ['R-OAS-1'], gray: false, state: exit === 0 ? 'passed' : 'failed', note: null, annotations: generated ? [`${generated[0]}`] : [], errors: exit === 0 ? [] : [`exit ${exit}`] });
  return rows;
}
