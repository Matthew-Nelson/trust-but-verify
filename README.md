# trust-but-verify

**How do you trust software you didn't write, in a language you can't read?**

AI agents can now build working software in any language. The scarce skill is no longer writing code. It's knowing whether the code is right. This repo is a worked example: a URL-shortener API written by AI agents in **Rust (a language I don't know)**, and a verification system that lets a skeptical third party confirm it works **without reading or trusting the code, the agents, or me**.

> Status: **verified (`verified-v1`).** Every number below comes from `make verify` evidence in [`reports/`](reports/VERIFICATION.md) and can be reproduced from a clean clone. What it does **not** prove is listed at the end of the report.

## Results

| Evidence | Result |
|---|---|
| Requirements with passing independent tests | **72 / 72** (64 black-box, 8 gray-box); 0 failing, pending or unverified |
| Public acceptance suite (API, invariants, UI) | **417 / 417**, in each of 3 clean runs on fresh databases |
| Hidden holdout suite (sealed before implementation, revealed after) | **106 / 106** in each of 3 runs; all three seals verified at reveal |
| Mutant zoo: realistic bugs from a red team that never saw the tests | **34 / 37** caught first time; **37 / 37** after one blind gap round (36 by the test for the bug's own requirement) |
| Schemathesis fuzzing (R-OAS-1) | 1,912 generated cases per run, **0 failures**, 3 runs |
| Concurrency invariants (alias race, 500-redirect burst, 1,000 unique codes) | **8 / 8**, in each of 3 runs |
| Accessibility (axe-core, serious + critical, 8 UI states) | **0** violations |
| Static checks (fmt, clippy `-D warnings`, `forbid(unsafe_code)`, cargo test, UI lint/types/build) | all pass |
| Dependency audit (`cargo audit`, 213 crates) | **0** advisories (npm dependencies not audited) |
| Implementer's own tests (`cargo-mutants`, context only) | 174 caught, 9 missed, 7 timeouts, 14 unviable |

**Read the mutant line carefully.** The first-shot number, 34 of 37, measures the tests exactly as they were frozen before anyone saw a bug. All three misses were in the two requirements the tests openly said they had no test for. Their descriptions, in spec terms only, went to a fresh test author who never saw the code or the bugs. The resulting tests were reviewed blind, and the re-run caught all 37. That shows the gaps could be closed from the spec. It doesn't show the original tests would have caught those bugs.

**Open items.** The table above is the `verified-v1` evidence, which was collected locally. Later runs on GitHub Actions (2-CPU Linux runners) found two problems that are still open:
- **R-UI-10 (accessibility), intermittent on CI.** `[R-UI-10] / after a success` failed in 2 of 6 CI baselines with the axe violation `serious document-title`. It passed in all 12 nightly acceptance runs and has never failed locally, including under CPU throttling, parallel load and cold starts. The cause is unknown: either the page briefly has no `<title>` after a create, or axe reads the page mid-update. Neither the tests nor the app were changed to make it pass.
- **R-ALIAS-5 (alias race), weak on slow clients.** The alias-race test caught the check-then-upsert mutant (#18) in 1 of 2 CI mutant rounds. Locally, starving the test process of CPU reproduces this: 8 of 24 trials caught the mutant, and in 2 of 8 runs no trial did. The 20 requests stop arriving together when the client is slow. A fix was written, but the work stopped before blind review and before the fix was run against the mutant, so `harness/` is still `harness-v1.2`.
- **Database stall.** One full API run at `impl-v1` (before verification) failed 4 tests during an unexplained ~3 s database stall. It was not reproduced in 18 later full runs (10 re-runs at `impl-v1`, 7 verification baselines, 1 acceptance run). See the report's limits section.

Details of all three are in [`provenance/LOG.md`](provenance/LOG.md).

Full report: [`reports/VERIFICATION.md`](reports/VERIFICATION.md) (HTML: `reports/VERIFICATION.html`; the release tier can publish it to GitHub Pages, which is not turned on yet). Isolation audit: [`reports/AUDIT.md`](reports/AUDIT.md). Hands-on checklist for a person: [`reports/HUMAN_ACCEPTANCE.md`](reports/HUMAN_ACCEPTANCE.md).

## How it got here

| Tag | What happened |
|---|---|
| `spec-v1` | Spec signed off after two blind adversarial reviews by different models (88 findings, 0 rejected) |
| `spec-v1.1`–`v1.3` | Ambiguities found by the blind test author, resolved before any code existed |
| `harness-v1` | Tests frozen after a blind review (round 1: BLOCK with 3 blocking findings; round 2: sign-off) |
| `impl-v1` | Rust API and Next.js UI built by agents that never saw the hidden tests |
| `spec-v1.4`, `harness-v1.1` | Building exposed 3 test-suite bugs a correct implementation couldn't pass; fixed blind and re-reviewed |
| `mutants-v1` | 37 realistic bugs planted by a red team (a different model) that never saw any test |
| `spec-v1.5`, `harness-v1.2` | The 3 surviving bugs closed by a blind gap round (fault-injection tests), reviewed blind |
| `verified-v1` | Holdout revealed, all evidence collected, report published |

## How it works

1. **Intent first.** A spec with an ID on every requirement is adversarially reviewed for ambiguity, then signed off and frozen *before any code exists*.
2. **Tests written blind.** A separate agent writes the acceptance tests from the spec alone. Git history shows they were committed before the first line of Rust.
3. **Hidden holdout.** Part of the suite stays hidden from the implementers and is revealed only afterward. A passing public suite with a failing holdout would mean the code was tuned to the tests.
4. **Testing the tests.** A red-team agent that never saw the tests plants realistic bugs (37 here). The harness must catch every one. Any it misses go back, in spec terms only, to a fresh test author.
5. **Non-AI checks.** Property-based fuzzing (Schemathesis), concurrency invariants, the Rust compiler, and dependency audits.
6. **Reproducible.** `make verify` from a clean clone. The CI workflow defines a fast acceptance tier on every push, a nightly flakiness and mutant check, and the full pipeline on each release. It is currently disabled to save CI minutes; re-enable it with `gh workflow enable verify.yml`.

The full method, including what this does **not** prove: [`METHOD.md`](METHOD.md). Every prompt given to every agent: [`provenance/`](provenance/).

## The system under test

A URL shortener with click analytics: create short links, redirect, and record referrer, country and device. Rust (axum + sqlx + Postgres) for the API; a minimal Next.js UI. Spec: [`spec/SPEC.md`](spec/SPEC.md).
