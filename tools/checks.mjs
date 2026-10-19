#!/usr/bin/env node
// Static and implementer-side checks on impls/ at the current checkout. Each check records its command,
// exit status and the tail of its output. Writes reports/raw/checks.json.
//
// Api: forbid(unsafe_code), cargo fmt --check, clippy -D warnings, cargo test (unit + #[sqlx::test]),
// cargo audit. Web: lint, build, then typecheck (Next generates route types during the build).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, dbUrl, freshDb, log } from './lib.mjs';

const API = join(REPO, 'impls', 'api');
const WEB = join(REPO, 'impls', 'web');
const PATH = `${process.env.HOME}/.cargo/bin:${process.env.PATH}`;

function check(name, cmd, argv, cwd, env = {}) {
  log(name);
  const t0 = Date.now();
  const r = spawnSync(cmd, argv, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, PATH, ...env } });
  const out = ((r.stdout ?? '') + (r.stderr ?? '')).trim().split('\n');
  return { name, command: `${cmd} ${argv.join(' ')}`, cwd: cwd.replace(REPO + '/', ''), ok: r.status === 0, exit: r.status, seconds: Math.round((Date.now() - t0) / 1000), tail: out.slice(-12) };
}

const results = [];
const main = readFileSync(join(API, 'src', 'main.rs'), 'utf8');
results.push({ name: 'forbid(unsafe_code)', command: 'grep main.rs', cwd: 'impls/api', ok: main.includes('#![forbid(unsafe_code)]'), exit: null, seconds: 0, tail: [] });
const offline = { SQLX_OFFLINE: 'true', DATABASE_URL: '' };
results.push(check('cargo fmt --check', 'cargo', ['fmt', '--check'], API));
results.push(check('cargo clippy -D warnings', 'cargo', ['clippy', '--all-targets', '--', '-D', 'warnings'], API, offline));
freshDb('tbv_checks');
// Compile against the committed .sqlx cache; DATABASE_URL is only for #[sqlx::test] at run time.
results.push(check('cargo test', 'cargo', ['test'], API, { SQLX_OFFLINE: 'true', DATABASE_URL: dbUrl('tbv_checks') }));
results.push(check('cargo audit', 'cargo', ['audit'], API));
results.push(check('web: pnpm install', 'pnpm', ['install', '--frozen-lockfile'], WEB, { CI: 'true' }));
results.push(check('web: pnpm lint', 'pnpm', ['lint'], WEB));
results.push(check('web: pnpm build', 'pnpm', ['build'], WEB, { API_URL: 'http://localhost:8080' }));
results.push(check('web: pnpm typecheck (after build)', 'pnpm', ['typecheck'], WEB));

const versions = {};
for (const [k, c, a] of [['rustc', 'rustc', ['--version']], ['cargo-audit', 'cargo', ['audit', '--version']], ['node', 'node', ['--version']], ['pnpm', 'pnpm', ['--version']]]) {
  versions[k] = spawnSync(c, a, { encoding: 'utf8', env: { ...process.env, PATH } }).stdout?.trim();
}
mkdirSync(join(REPO, 'reports', 'raw'), { recursive: true });
writeFileSync(join(REPO, 'reports', 'raw', 'checks.json'), JSON.stringify({ generatedAt: new Date().toISOString(), versions, results }, null, 1));
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
