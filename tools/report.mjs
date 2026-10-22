#!/usr/bin/env node
// Writes reports/VERIFICATION.md and reports/VERIFICATION.html from the raw evidence:
//   reports/raw/trace.json            (tools/trace.mjs)
//   reports/raw/mutants/run-*/        (tools/mutate.mjs; one directory per round)
//   reports/raw/checks.json           (tools/checks.mjs)
//   reports/raw/cargo-mutants/        (optional: cargo-mutants outcomes, implementer-test quality)
//   reports/AUDIT.md, reports/LIMITS.md (hand-written: isolation audit, what this does not prove)
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, readText } from './lib.mjs';

const RAW = join(REPO, 'reports', 'raw');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const opt = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a');
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

const trace = read(join(RAW, 'trace.json'));
const rounds = readdirSync(join(RAW, 'mutants'))
  .filter((d) => d.startsWith('run-') && existsSync(join(RAW, 'mutants', d, 'results.json')))
  .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)))
  .map((d) => ({ name: d, ...read(join(RAW, 'mutants', d, 'results.json')) }));
const checks = existsSync(join(RAW, 'checks.json')) ? read(join(RAW, 'checks.json')) : null;
const cargoMutants = existsSync(join(RAW, 'cargo-mutants', 'summary.json')) ? read(join(RAW, 'cargo-mutants', 'summary.json')) : null;
const fuzzRuns = [];
// Fuzz counts come from the same round's baselines as the traceability matrix (the newest round).
for (const r of trace.runs) {
  const dir = join(RAW, 'mutants', rounds[rounds.length - 1]?.name ?? 'run-0', r);
  const log = readText(join(dir, 'fuzz.log'));
  const m = log?.match(/(\d+) generated, (\d+) passed/);
  if (m) fuzzRuns.push({ run: r, generated: Number(m[1]), passed: Number(m[2]) });
}

const L = [];
const P = (...s) => L.push(...s);
const final = rounds[rounds.length - 1];
const first = rounds[0];
const killed = (rs) => rs.results.filter((r) => r.verdict === 'killed');
const valid = (rs) => rs.results.filter((r) => r.verdict === 'killed' || r.verdict === 'survived');
const bs = trace.bySuite;
const sum = (keys, f) => keys.reduce((a, k) => a + (bs[k]?.[f] ?? 0), 0);

// Highest spec-vX.Y tag named in SPEC's Status line.
const specStatus = readFileSync(join(REPO, 'spec', 'SPEC.md'), 'utf8').split('\n').find((l) => l.startsWith('**Status')) ?? '';
const specTag = (specStatus.match(/spec-v[0-9.]*[0-9]/g) ?? ['spec']).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).pop();

P('# Verification report', '');
P(`Generated ${new Date().toISOString()} by \`tools/report.mjs\` from the raw evidence in \`reports/raw/\`. Implementation \`impl-v1\`, spec \`${specTag}\`, harness \`${final?.harnessTag ?? '?'}\`, holdout seal 3.`, '');

P('## Summary', '');
P('| Evidence | Result |', '|---|---|');
P(`| Requirements | ${Object.entries(trace.statusCounts).map(([k, v]) => `${v} ${k}`).join(', ')} (of ${trace.matrix.length}) |`);
P(`| Public suites (api, invariants, UI), ${trace.runs.length / 2} repeated clean runs each | ${sum(['api', 'invariants', 'ui'], 'passedAllRuns')} of ${sum(['api', 'invariants', 'ui'], 'tests')} tests passed in every run |`);
P(`| Holdout (hidden until after \`impl-v1\`) | ${sum(['holdout', 'holdout-ui'], 'passedAllRuns')} of ${sum(['holdout', 'holdout-ui'], 'tests')} tests passed in every run |`);
if (fuzzRuns.length) P(`| Fuzzing (Schemathesis, R-OAS-1) | ${fuzzRuns.map((f) => `${f.passed}/${f.generated}`).join(', ')} generated cases passed per run |`);
const roundLabel = (r) => [r.harnessTag, r.host && `${r.host.where}, ${r.host.platform}, ${r.host.cpus} CPUs`].filter(Boolean).join('; ');
for (const r of rounds) P(`| Mutants, ${r.name}${roundLabel(r) ? ` (${roundLabel(r)})` : ''} | **${killed(r).length} of ${valid(r).length} killed** (${pct(killed(r).length, valid(r).length)}); ${killed(r).filter((x) => x.targeted).length} by a test carrying the mutant's requirement ID |`);
if (checks) P(`| Static and implementer checks | ${checks.results.filter((c) => c.ok).length} of ${checks.results.length} pass (${checks.results.filter((c) => !c.ok).map((c) => c.name).join(', ') || 'none failing'}) |`);
if (cargoMutants) P(`| cargo-mutants (implementer's own tests, context only) | ${cargoMutants.caught} caught, ${cargoMutants.missed} missed, ${cargoMutants.timeout} timeout, ${cargoMutants.unviable} unviable |`);
P('');

P('## Suites across repeated clean runs', '');
P('Each run starts from fresh databases. Gray-box variables (`DATABASE_URL`, `API_BIN`) are set, so nothing is pending.', '');
P('| Suite | Tests | Passed in every run | Failed in some run | Skipped | Runs |', '|---|---|---|---|---|---|');
for (const [k, v] of Object.entries(bs)) P(`| ${k} | ${v.tests} | ${v.passedAllRuns} | ${v.failedSomeRun} | ${v.skipped} | ${v.runs} |`);
P('');

P('## Mutants', '');
if (rounds.length > 1) {
  // A round on a new harness tag follows a gap round; a round on the same tag as the one before is a reproduction.
  const gapRounds = rounds.slice(1).filter((r, i) => r.harnessTag !== rounds[i].harnessTag).map((r) => r.name);
  const reproRounds = rounds.slice(1).filter((r, i) => r.harnessTag === rounds[i].harnessTag).map((r) => r.name);
  const s = [`**How to read the rounds.** ${first.name} measured the harness as frozen before anyone saw a mutant: that is the first-shot number.`];
  if (gapRounds.length) s.push(`Its survivors were then described in spec terms only (requirement and undetected behavior, no patch) to a fresh harness author who never saw the implementation or the mutants, the resulting tests were reviewed blind, and ${gapRounds.join(', ')} re-ran every mutant against the new harness with fresh baselines. Those rounds are therefore not independent of earlier ones: they show the gaps were closable from the spec, not that the harness would have caught these bugs unaided.`);
  if (reproRounds.length) s.push(`${reproRounds.join(', ')} re-ran the same harness as the round before, with fresh baselines and no test changes: a reproduction, possibly on a different machine (see the summary), not a new gap round. Where a reproduction disagrees with the round before, the mutant's requirement is sensitive to the environment.`);
  P(s.join(' '), '');
}
P('Each mutant is a realistic bug written by a red team (Fable) that never saw the harness or the holdout. A mutant is **killed** when a test that passed in every clean baseline run fails; tests that failed in any baseline are excluded (unstable). **Targeted** means a killing test carries the mutant\'s requirement ID; **incidental** means only tests for other requirements caught it.', '');
const idx = opt(join(REPO, 'mutants', 'INDEX.md')) ?? '';
const desc = Object.fromEntries([...idx.matchAll(/^\| `([^`]+)\.patch` \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/gm)].map((m) => [m[1], { cat: m[3].trim(), text: m[4].trim(), guess: m[5].trim() }]));
const header = ['Mutant', 'Requirement', 'Red-team guess', ...rounds.map((r) => r.name), 'Caught by'];
if (!rounds.length) P('_No mutant results yet._', '');
else P(`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`);
for (const m of first?.results ?? []) {
  const cells = rounds.map((r) => {
    const x = r.results.find((y) => y.mutant === m.mutant) ?? m;
    return x.verdict === 'killed' ? `killed (${x.targeted ? 'targeted' : 'incidental'})` : `**${x.verdict}**`;
  });
  const last = final.results.find((y) => y.mutant === m.mutant) ?? m;
  const by = Object.entries(last.killersBySuite ?? {}).map(([s, n]) => `${s} ${n}`).join(', ');
  P(`| ${m.mutant}<br>${esc(desc[m.mutant]?.text ?? '')} | ${m.id} | ${desc[m.mutant]?.guess ?? ''} | ${cells.join(' | ')} | ${by} |`);
}
P('');

P('## Traceability', '');
P('One row per requirement ID in `spec/SPEC.md`. Statuses: **verified** (a black-box test passed in every run), **gray-box verified** (only gray-box tests cover it), **mutant-verified only**, **failing**, **pending**, **unverified**. A skipped gray-box test is never a pass.', '');
P('| ID | Labels | Status | Evidence | Mutants |', '|---|---|---|---|---|');
for (const m of trace.matrix) P(`| ${m.id} | ${m.labels.join(', ')} | ${/verified/.test(m.status) && !/un/.test(m.status) ? m.status : `**${m.status}**`} | ${esc(m.why)} | ${esc(m.mutants.join('; '))} |`);
P('');

if (checks) {
  P('## Static and implementer checks', '');
  P(`Tool versions: ${Object.entries(checks.versions).map(([k, v]) => `${k} \`${v}\``).join(', ')}.`, '');
  P('| Check | Result | Command |', '|---|---|---|');
  for (const c of checks.results) P(`| ${c.name} | ${c.ok ? 'pass' : '**fail**'} | \`${esc(c.command)}\` (${c.cwd}) |`);
  P('');
}
if (cargoMutants) {
  P('## cargo-mutants (implementer-test quality)', '');
  P('This measures the implementer\'s own Rust tests, not the independent harness, and is reported for context only.', '');
  P(`Caught ${cargoMutants.caught}, missed ${cargoMutants.missed}, timeout ${cargoMutants.timeout}, unviable ${cargoMutants.unviable}. Command: \`${cargoMutants.command}\`.`, '');
}
const audit = opt(join(REPO, 'reports', 'AUDIT.md'));
if (audit) P(audit.trim(), '');
const limits = opt(join(REPO, 'reports', 'LIMITS.md'));
if (limits) P(limits.trim(), '');

const md = L.join('\n') + '\n';
writeFileSync(join(REPO, 'reports', 'VERIFICATION.md'), md);
writeFileSync(join(REPO, 'reports', 'VERIFICATION.html'), toHtml(md));
console.log(`wrote reports/VERIFICATION.md (${L.length} lines) and reports/VERIFICATION.html`);

/** Minimal Markdown to HTML: headings, tables, lists, paragraphs, bold, code, links. */
function toHtml(src) {
  const inline = (s) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/&lt;br&gt;/g, '<br>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\\\|/g, '|');
  const cells = (row) => row.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());
  const out = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^#{1,4} /.test(l)) {
      const n = l.match(/^#+/)[0].length;
      out.push(`<h${n}>${inline(l.slice(n + 1))}</h${n}>`);
    } else if (l.startsWith('|') && lines[i + 1]?.startsWith('|---')) {
      out.push('<div class="t"><table><thead><tr>' + cells(l).map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
      i += 2;
      while (i < lines.length && lines[i].startsWith('|')) out.push('<tr>' + cells(lines[i++]).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
      i--;
      out.push('</tbody></table></div>');
    } else if (/^\s*- /.test(l)) {
      out.push('<ul>');
      while (i < lines.length && /^\s*- /.test(lines[i])) out.push(`<li>${inline(lines[i++].replace(/^\s*- /, ''))}</li>`);
      i--;
      out.push('</ul>');
    } else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verification report</title>
<style>:root{--bg:#fff;--fg:#1a1a1a;--mut:#666;--line:#ddd;--head:#f4f4f4}@media (prefers-color-scheme:dark){:root{--bg:#121212;--fg:#e8e8e8;--mut:#aaa;--line:#333;--head:#1e1e1e}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:16px}h1,h2{line-height:1.2}h2{margin-top:2em;border-bottom:1px solid var(--line);padding-bottom:4px}
.t{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top}th{background:var(--head)}code{font-size:12px}</style></head><body>
${out.join('\n')}
</body></html>
`;
}
