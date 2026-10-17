# trust-but-verify

This repo's product is a **verification method**. The shortlink app in `impls/` is the system under test, not the point. Read `METHOD.md` before doing anything.

```
spec/          SPEC.md (requirement IDs) + openapi.json. The source of truth.
harness/       Independent acceptance tests (TypeScript): API, invariants, UI, fuzzing
impls/api/     Rust api (system under test)
impls/web/     Minimal Next.js UI (system under test)
mutants/       Deliberate bugs as patches; the harness must reject every one
tools/         Mutant runner, traceability/report generator
reports/       Generated verification evidence
provenance/    Every agent prompt + LOG.md of every agent run
```

## Hard rules for every agent

1. **Stay in your role.** Your prompt says what you may read and write. If you can see something your role says you mustn't, don't open it. Say so in your report.
2. **Only the coordinator edits `spec/`.** If the spec is wrong, ambiguous or untestable, append to `spec/PROPOSALS.md` (requirement ID, problem, suggested change) and carry on with the current text.
3. **Implementers never edit `harness/`.** You may run it. CI fails any implementation change that touches `harness/`.
4. **Never weaken a check to get green.** No skipped or ignored tests, loosened assertions, special-casing of test inputs, or mocks of the system under test. If something can't pass, report it.
5. **Every test title starts with the requirement ID(s) it checks**, e.g. `[R-REDIR-1] known code returns 302`. Every mutant names the ID it violates.
6. **Report honestly.** Your final report lists what passed, what didn't, what you're unsure of, and every deviation from your prompt.

## Local environment
- Postgres.app (no Docker), user `matthewnelson`, no password. Ask the user to open it if it's unreachable.
- Node via nvm; pnpm. Python tools via `uvx`. Rust via rustup. If `cargo` is missing, stop and ask.
- Never read or print `.env` files (a hook blocks it). Commit `.env.example` files.
