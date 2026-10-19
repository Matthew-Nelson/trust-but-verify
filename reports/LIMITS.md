## What this does not prove

- **That the spec is right.** Everything here checks the implementation against `spec/SPEC.md`. A requirement that is wrong or missing gets tested and implemented faithfully. The spec had two adversarial reviews and the owner's sign-off. Beyond that, this is the human part.
- **Independence equal to unrelated humans.** Every role is an LLM agent. Different model families were used per role (Opus for the spec and harness, Sonnet for the implementations, Fable for the reviews and red team), plus a non-LLM fuzzer, and mutants are measured by numbers. Shared training can still line up blind spots.
- **That the coordinator leaked nothing.** One session wrote every prompt and saw every phase. The prompts are published verbatim in `provenance/prompts/` so this can be inspected. Post-freeze harness fixes were made by the blind harness author from SPEC reasoning alone and re-reviewed blind.
- **That agents couldn't have looked.** Transcripts show what they did (see the isolation audit), not what was technically possible on a shared machine.
- **Requirements without a test.** R-ERR-7 and R-REDIR-6 are *mutant-verified* by SPEC and have no direct test in the frozen harness. Their status comes only from the mutants and the gap loop (see the mutant table and traceability).
- **Gray-box coupling.** Gray-box tests read and seed the database schema declared in SPEC, so a correct implementation with a different schema would fail them.
- **R-PRIV-1 has a residual false-failure path (HR2-03).** An api that logs its database host's *resolved* address could match the client address and fail the log search. This can only produce a false failure, never a false pass. Verification runs use `DATABASE_URL` host `localhost`.
- **Probabilistic requirements.** R-ALIAS-5 and R-REDIR-5 passing shows the races weren't observed in these runs, not that they can't happen.
- **Production behavior.** All results are for a single instance on local Postgres (Postgres.app 17 on macOS): not scale, network faults, a hostile internet or another OS.
- **Intermittent failures.** One full API run at `impl-v1` failed 4 tests during an unexplained ~3 s database stall (pool exhaustion), and it was not reproduced in later runs. The repeated-run table shows the pass rate actually observed. Its cause is unknown.
- **The UI beyond its contract.** The UI is verified through roles and accessible names (R-UI-1 to R-UI-12), not visual design or usability. Some clauses are labeled unverifiable: R-UI-4's "anything else", R-UI-5's empty state, and R-UI-12's client-side GET.
