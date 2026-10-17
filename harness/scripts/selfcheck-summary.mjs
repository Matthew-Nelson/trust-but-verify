// Summarize a vitest JSON report: counts and failure causes, plus every passing test.
import { readFileSync } from 'node:fs';
const r = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const cat = {}; const passed = []; let skipped = 0; let total = 0;
for (const f of r.testResults) for (const t of f.assertionResults) {
  total++;
  if (t.status === 'passed') passed.push(t.fullName);
  else if (t.status !== 'failed') skipped++;
  else {
    const m = (t.failureMessages || []).join('\n');
    const k = /ECONNREFUSED|fetch failed|socket hang up|ECONNRESET/.test(m) ? 'connection error'
      : /\[R-ERR-1\]/.test(m) ? 'R-ERR-1 envelope violation'
      : /setup:/.test(m) ? 'setup (created link did not echo request)'
      : 'own assertion';
    cat[k] = (cat[k] || 0) + 1;
  }
}
console.log(JSON.stringify({ total, failed: Object.values(cat).reduce((a, b) => a + b, 0), passed: passed.length, skipped, causes: cat, passedTests: passed }, null, 2));
