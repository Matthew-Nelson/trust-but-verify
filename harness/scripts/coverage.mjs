#!/usr/bin/env node
// Generates COVERAGE.md: every requirement ID in spec/SPEC.md -> the public tests whose titles name it.
// Exits non-zero if an ID has no test and is not listed in NO_TEST below.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const spec = readFileSync(join(root, '..', 'spec', 'SPEC.md'), 'utf8');

// SPEC IDs, in order, with their verification labels.
const ids = [];
const labels = {};
for (const line of spec.split('\n')) {
  const m = /^\| (R-[A-Z]+-\d+) \|(.*)\|\s*$/.exec(line);
  if (!m) continue;
  ids.push(m[1]);
  labels[m[1]] = ['gray-box', 'mutant-verified', 'probabilistic', 'unverifiable'].filter((l) => m[2].includes(`*(${l}`) || m[2].includes(`(${l}`) || m[2].includes(`${l})*`) || m[2].includes(`is ${l}`));
}

// Public test titles: string literals that start with "[R-".
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(test|spec)\.ts$/.test(f)) files.push(p);
  }
})(join(root, 'tests'));
const byId = Object.fromEntries(ids.map((i) => [i, []]));
const unknown = new Set();
let titleCount = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const lits = /'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\])*)`/g;
  for (const m of src.matchAll(lits)) {
    const title = (m[1] ?? m[2] ?? m[3]).replace(/\\(.)/g, '$1');
    if (!/^\[R-[A-Z]+-\d+\]/.test(title)) continue;
    const head = /^((?:\[[^\]]+\])+)/.exec(title)[1];
    titleCount++;
    for (const id of head.match(/R-[A-Z]+-\d+/g)) {
      if (!byId[id]) unknown.add(id);
      else byId[id].push({ file: relative(root, f), title, gray: head.includes('[gray-box]') });
    }
  }
}
// R-OAS-1 is verified by the fuzz script, not a test file.
byId['R-OAS-1'].push({ file: 'scripts/fuzz.mjs', title: '`pnpm fuzz`: Schemathesis run (all checks except positive_data_acceptance, positive + negative, fixed seed, 100 examples/op)', gray: false });

const NO_TEST = {
  'R-ERR-7': 'Mutant-verified per SPEC; no dedicated test, because a 500 cannot be forced from outside. Checked opportunistically: `lib/http.ts` rejects any 500 the harness receives whose body is not exactly the canonical internal error, which fails the test that saw it. Reported **unverified** unless a 500 was observed.',
  'R-REDIR-6': 'Mutant-verified per SPEC. A click-recording failure cannot be caused from outside without a test backdoor (v1 has none); holding a lock on `clicks` would show a delay, not a failure, so the harness does not claim it. Reported **unverified** by this harness.',
};
const NOTES = {
  'R-LINK-7': 'First sentence black-box (no-alias creates never 409, incl. 1,000 bulk creates). The collision/regeneration clause is **unverifiable** (SPEC): a 62^7 space cannot be forced to collide without a backdoor.',
  'R-ERR-1': 'Also enforced on every response the harness receives: `lib/http.ts` throws `[R-ERR-1]` on any 4xx/5xx from `/healthz` or `/api/<non-empty>` that is not the JSON envelope.',
  'R-ERR-4': 'Also enforced on every error the harness receives (message patterns); echo checks use unique probe values.',
  'R-REDIR-5': '**Probabilistic** (SPEC): a pass shows lost clicks were not observed.',
  'R-ALIAS-5': '**Probabilistic** (SPEC). Run 3 times per suite run.',
  'R-PRIV-1': '**Gray-box only.** Schema (no inet columns) and stored click rows need DATABASE_URL; the log search needs API_BIN + DATABASE_URL and searches the stdout/stderr of a harness-spawned instance (not the externally started one) for the client address in IPv4, IPv4-mapped IPv6 and hex forms; the searched address is recorded as a test annotation.',
  'R-DATA-1': '**Gray-box only** (rows inserted directly into `clicks`).',
  'R-DATA-2': '**Gray-box only** (reads stored columns; seeds NULL/encoded values).',
  'R-DATA-3': '**Gray-box only** (schema inspection via information_schema / pg_catalog).',
  'R-HEALTH-1': 'Success branch black-box. The 503 branch is **gray-box**: needs API_BIN; the harness starts an api instance whose DATABASE_URL points at a harness-owned listener that accepts TCP and never responds.',
  'R-HEALTH-2': '**Gray-box only**: needs API_BIN (startup with the database refusing connections) and DATABASE_URL for the recovery half.',
  'R-HEALTH-3': '**Mutant-verified** per SPEC. The harness adds a gray-box check (API_BIN + DATABASE_URL): a TCP proxy flips from forwarding to black-holing and the very next /healthz must be 503.',
  'R-STATS-2': 'Black-box for length/order/zero-fill/"today" via createdAt and daily[last]; exact per-day placement is **gray-box** (seeded rows at absolute instants anchored to the database date).',
  'R-STATS-3': 'Black-box only for "a click now counts today"; window edges are **gray-box** (seeded rows).',
  'R-UI-3': 'Clipboard checked in Chromium with clipboard permissions via navigator.clipboard.readText().',
  'R-UI-4': 'The "anything else -> Something went wrong" row cannot be triggered from the UI (no UI input yields another error code); it is not checked.',
  'R-UI-5': '"With no links it has no body rows" cannot be checked on a shared, non-empty database (SPEC: never truncate). Thousands separator/seconds truncation edge cases are gray-box.',
  'R-UI-11': 'Enforced in every UI test by an auto fixture (network capture), plus a dedicated journey test.',
  'R-OAS-1': 'Not a Vitest test. Needs a dedicated api instance + database (FUZZ_API).',
};

const missing = ids.filter((i) => byId[i].length === 0 && !NO_TEST[i]);
let md = `# Coverage manifest\n\nGenerated by \`pnpm coverage:manifest\` from \`../spec/SPEC.md\` (${ids.length} requirement IDs) and the public test titles in \`tests/\` (${titleCount} titles; parameterized titles count once here). Every test title starts with the ID(s) it checks. The hidden holdout suite is not listed.\n\n`;
md += `Legend: **BB** black-box HTTP/browser, **GB** gray-box (skips cleanly without DATABASE_URL / API_BIN), SPEC label in parentheses.\n\n`;
md += `## Rules without a harness test\n\n${Object.entries(NO_TEST).map(([k, v]) => `- **${k}**: ${v}`).join('\n')}\n\n`;
md += `## Rules checked only gray-box\n\n${ids.filter((i) => byId[i].length && byId[i].every((t) => t.gray)).map((i) => `- **${i}**: ${NOTES[i] ?? ''}`).join('\n')}\n\n`;
md += `## Rules with special verification status\n\n${ids.filter((i) => labels[i].length && !NO_TEST[i] && !(byId[i].length && byId[i].every((t) => t.gray))).map((i) => `- **${i}** (${labels[i].join(', ')}): ${NOTES[i] ?? ''}`).join('\n')}\n\n`;
md += `## Requirement -> tests\n\n| ID | SPEC label | Mode | Tests |\n|---|---|---|---|\n`;
for (const id of ids) {
  const ts = byId[id];
  const mode = ts.length === 0 ? '**none**' : ts.every((t) => t.gray) ? 'GB' : ts.some((t) => t.gray) ? 'BB + GB' : 'BB';
  const list = ts.length === 0 ? NO_TEST[id] : ts.map((t) => `\`${t.file}\`: ${t.title.replace(/\|/g, '\\|').replace(/\$\{[^}]+\}/g, '…')}`).join('<br>');
  const note = NOTES[id] ? `<br>*Note:* ${NOTES[id].replace(/\|/g, '\\|')}` : '';
  md += `| ${id} | ${labels[id].join(', ') || '-'} | ${mode} | ${list}${ts.length ? note : ''} |\n`;
}
writeFileSync(join(root, 'COVERAGE.md'), md);
console.log(`COVERAGE.md: ${ids.length} IDs, ${titleCount} titles, ${missing.length} uncovered${missing.length ? ': ' + missing.join(', ') : ''}`);
if (unknown.size) console.log(`IDs in tests but not in SPEC: ${[...unknown].join(', ')}`);
process.exit(missing.length || unknown.size ? 1 : 0);
