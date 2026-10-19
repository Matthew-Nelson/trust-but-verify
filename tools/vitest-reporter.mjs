// Vitest reporter that keeps what the built-in JSON reporter drops: each test's skip note and its
// annotations (checked on Vitest 4.1.11, spec/reviews/05-disposition.md HR2-05). The trace tool needs
// both: a gray-box skip is reported as pending, and its note says which variable was missing.
// Output: the file named by TBV_RESULTS_FILE.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, relative } from 'node:path';

export default class NotesReporter {
  onInit(vitest) {
    this.root = vitest.config.root;
  }

  onTestRunEnd(testModules, unhandledErrors) {
    const out = process.env.TBV_RESULTS_FILE;
    if (!out) throw new Error('vitest-reporter: TBV_RESULTS_FILE is not set');
    const tests = [];
    for (const mod of testModules) {
      for (const t of mod.children.allTests()) {
        const r = t.result();
        tests.push({
          project: t.project.name || '',
          file: relative(this.root, mod.moduleId),
          name: t.fullName,
          state: r.state,
          note: r.state === 'skipped' ? (r.note ?? null) : null,
          annotations: t.annotations().map((a) => a.message),
          errors: (r.errors ?? []).map((e) => String(e.message ?? e).split('\n')[0].slice(0, 400)),
          durationMs: Math.round(t.diagnostic()?.duration ?? 0),
        });
      }
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(
      out,
      JSON.stringify({ tests, unhandledErrors: unhandledErrors.map((e) => String(e.message ?? e).slice(0, 400)) }, null, 1),
    );
  }
}
