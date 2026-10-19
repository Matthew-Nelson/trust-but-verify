#!/usr/bin/env node
// Traceability: joins every requirement ID in spec/SPEC.md with the repeated acceptance runs
// (the clean baselines from tools/mutate.mjs) and the mutant results, and gives each ID one status:
//
//   verified            a black-box test for it passed in every run, and none failed
//   gray-box verified   only gray-box tests (seeded rows, schema, spawned instances) cover it, all passing
//   mutant-verified only no test for it, but every mutant targeting it was killed
//   failing             a test for it failed in at least one run ("intermittent" if it also passed)
//   pending             its only tests were skipped (gray-box variables unset, or R-PRIV-1 inconclusive)
//   unverified          nothing shows it: labeled unverifiable, untested, or a targeting mutant survived
//
// A skipped gray-box test is pending, never a pass. The build fails if a skip note has no recognized
// prefix (HP-20, HR2-05).
//
//   node tools/trace.mjs --runs reports/raw/mutants/run-0 [--mutants reports/raw/mutants/run-0 ...]
// Writes reports/raw/trace.json.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, fuzzRows, readText } from './lib.mjs';

const args = process.argv.slice(2);
const all = (name) => args.flatMap((a, i) => (args[i - 1] === `--${name}` ? [a] : []));
const RUN_DIRS = all('runs').map((d) => join(REPO, d));
const MUTANT_DIRS = all('mutants').map((d) => join(REPO, d));
const OUT = join(REPO, 'reports', 'raw', 'trace.json');

const SKIP_PREFIXES = ['pending (gray-box):', 'gray-box: DATABASE_URL is unset', 'inconclusive (gray-box):'];

function parseSpec() {
  const text = readFileSync(join(REPO, 'spec', 'SPEC.md'), 'utf8');
  const reqs = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\| (R-[A-Z]+-\d+) \| (.*) \|\s*$/);
    if (!m) continue;
    const body = m[2];
    const labels = [];
    if (/\*\(gray-box|also gray-box/.test(body)) labels.push('gray-box');
    if (/mutant-verified/.test(body)) labels.push('mutant-verified');
    if (/\*\(probabilistic/.test(body)) labels.push('probabilistic');
    if (/\*\(unverifiable\)\*\s*$/.test(body.trim()) || /^\*\(unverifiable\)\*/.test(body.trim())) labels.push('unverifiable');
    else if (/unverifiable/.test(body)) labels.push('partly unverifiable');
    reqs.push({ id: m[1], text: body.replace(/\*\(.*?\)\*/g, '').trim(), labels });
  }
  return reqs;
}

/** Loads rows from every baseline run directory under the given run dirs. */
function loadRuns() {
  const runs = [];
  for (const dir of RUN_DIRS) {
    for (const sub of readdirSync(dir).filter((d) => d.startsWith('baseline-')).sort()) {
      const f = join(dir, sub, 'rows.json');
      if (!existsSync(f)) continue;
      const { rows, exits } = JSON.parse(readFileSync(f, 'utf8'));
      // Re-derive fuzz rows from the saved JUnit report, so every run uses the current parser.
      const junit = join(dir, sub, 'fuzz-junit.xml');
      if (existsSync(junit)) {
        const kept = rows.filter((r) => r.suite !== 'fuzz');
        runs.push({ run: sub, rows: kept.concat(fuzzRows(readFileSync(junit, 'utf8'), exits.fuzz, readText(join(dir, sub, 'fuzz.log')) ?? '')) });
      } else runs.push({ run: sub, rows });
    }
  }
  if (!runs.length) throw new Error('no baseline runs found');
  return runs;
}

function loadMutants() {
  const out = [];
  for (const dir of MUTANT_DIRS) {
    const f = join(dir, 'results.json');
    if (existsSync(f)) out.push(...JSON.parse(readFileSync(f, 'utf8')).results.map((r) => ({ ...r, round: dir.split('/').pop() })));
  }
  // The latest round wins for each mutant.
  const latest = new Map();
  for (const r of out) latest.set(r.mutant, r);
  return [...latest.values()];
}

function main() {
  const reqs = parseSpec();
  const runs = loadRuns();
  const mutants = loadMutants();

  // Per test key: its states across runs.
  const tests = new Map();
  for (const { run, rows } of runs) {
    for (const r of rows) {
      if (r.state === 'skipped' && r.gray && !SKIP_PREFIXES.some((p) => (r.note ?? '').startsWith(p))) {
        throw new Error(`gray-box skip without a recognized note prefix: ${r.key} (note: ${r.note})`);
      }
      const t = tests.get(r.key) ?? { key: r.key, suite: r.suite, name: r.name, ids: r.ids, gray: r.gray, states: [], notes: [] };
      t.states.push(r.state);
      if (r.note) t.notes.push(r.note);
      tests.set(r.key, t);
    }
  }

  const matrix = reqs.map((q) => {
    const mine = [...tests.values()].filter((t) => t.ids.includes(q.id));
    const passing = mine.filter((t) => t.states.every((s) => s === 'passed'));
    const failing = mine.filter((t) => t.states.includes('failed'));
    const skipped = mine.filter((t) => t.states.every((s) => s === 'skipped'));
    const targeting = mutants.filter((m) => m.id === q.id);
    const mutantSummary = targeting.map((m) => `${m.mutant}: ${m.verdict}${m.verdict === 'killed' ? (m.targeted ? ' (targeted)' : ' (incidental)') : ''}`);
    let status;
    let why;
    if (failing.length) {
      const intermittent = failing.every((t) => t.states.includes('passed'));
      status = intermittent ? 'failing (intermittent)' : 'failing';
      why = failing.map((t) => `${t.suite}: ${t.name} [${t.states.join(',')}]`).join('; ');
    } else if (passing.length) {
      status = passing.some((t) => !t.gray) ? 'verified' : 'gray-box verified';
      why = `${passing.length} test(s), each passing in all ${Math.min(...passing.map((t) => t.states.length))}+ run(s) of its suite`;
      if (targeting.some((m) => m.verdict === 'survived')) why += '; a targeting mutant survived';
    } else if (skipped.length) {
      status = 'pending';
      why = [...new Set(skipped.flatMap((t) => t.notes))].join(' | ');
    } else if (targeting.length && targeting.every((m) => m.verdict === 'killed')) {
      status = 'mutant-verified only';
      why = mutantSummary.join('; ');
    } else {
      status = 'unverified';
      why = q.labels.includes('unverifiable') ? 'labeled unverifiable in SPEC' : targeting.length ? `no test; ${mutantSummary.join('; ')}` : 'no test and no mutant';
    }
    return {
      id: q.id,
      labels: q.labels,
      status,
      why,
      tests: { passing: passing.length, failing: failing.length, skipped: skipped.length },
      suites: [...new Set(mine.map((t) => t.suite))],
      mutants: mutantSummary,
    };
  });

  const bySuite = {};
  for (const t of tests.values()) {
    const s = (bySuite[t.suite] ??= { tests: 0, passedAllRuns: 0, failedSomeRun: 0, skipped: 0, runs: 0 });
    s.tests++;
    s.runs = Math.max(s.runs, t.states.length);
    if (t.states.every((x) => x === 'passed')) s.passedAllRuns++;
    else if (t.states.includes('failed')) s.failedSomeRun++;
    else s.skipped++;
  }
  const statusCounts = {};
  for (const m of matrix) statusCounts[m.status] = (statusCounts[m.status] ?? 0) + 1;
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), runs: runs.map((r) => r.run), statusCounts, bySuite, matrix }, null, 1));
  console.log(JSON.stringify({ statusCounts, bySuite }, null, 1));
}

main();
