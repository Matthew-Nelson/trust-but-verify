# trust-but-verify

**How do you trust software you didn't write, in a language you can't read?**

AI agents can now build working software in any language. The scarce skill is no longer writing code. It's knowing whether the code is right. This repo is a worked example: a URL-shortener API written by AI agents in **Rust (a language I don't know)**, and a verification system that lets a skeptical third party confirm it works **without reading or trusting the code, the agents, or me**.

> Status: **in progress.** Spec signed off (`spec-v1`) after two blind adversarial reviews by different models (88 findings, 0 rejected), then amended to `spec-v1.1` from the harness author's 19 proposals before any code existed. Harness frozen at `harness-v1` after a blind review by a different model (round 1: BLOCK, with 3 blocking findings; round 2: SIGN-OFF WITH NITS). Building the implementations exposed three test-suite bugs that a correct implementation could not pass (one in the UI suite, two in the fuzz setup). They were fixed blind by the original harness author, re-reviewed (round 3: SIGN-OFF WITH NITS), and frozen as `harness-v1.1` against `spec-v1.4`. Implementations built and frozen at `impl-v1`. Public suites against them: UI 35/35, invariants 8/8, fuzz 1,912/1,912; API 372/372 in 11 of 12 full runs, with **1 run failing 4 tests** during an unexplained ~3 s database stall (open item, `reports/raw/impl-v1-acceptance/`). Holdout still sealed (seal 3). The results below are placeholders until `verified-v1`.

## Results

| Evidence | Result |
|---|---|
| Requirements with passing independent tests | — / — |
| Public acceptance suite | — |
| Hidden holdout suite (revealed after implementation) | — |
| Mutant zoo: planted bugs caught | — / — |
| Schemathesis fuzzing (cases / failures) | — |
| Concurrency invariants | — |
| Accessibility (axe, serious + critical) | — |
| Dependency audit | — |

Full report: `reports/` (published to GitHub Pages once CI is set up).

## How it works

1. **Intent first.** A spec with an ID on every requirement is adversarially reviewed for ambiguity, then signed off and frozen *before any code exists*.
2. **Tests written blind.** A separate agent writes the acceptance tests from the spec alone. Git history shows they were committed before the first line of Rust.
3. **Hidden holdout.** Part of the suite stays hidden from the implementers and is revealed only afterward. A passing public suite with a failing holdout would mean the code was tuned to the tests.
4. **Testing the tests.** A red-team agent that never saw the tests plants about 20 realistic bugs. The harness must catch every one.
5. **Non-AI checks.** Property-based fuzzing (Schemathesis), concurrency invariants, the Rust compiler, and dependency audits.
6. **Reproducible.** `make verify` from a clean clone, and CI on every push.

The full method, including what this does **not** prove: [`METHOD.md`](METHOD.md). Every prompt given to every agent: [`provenance/`](provenance/).

## The system under test

A URL shortener with click analytics: create short links, redirect, and record referrer, country and device. Rust (axum + sqlx + Postgres) for the API; a minimal Next.js UI. Spec: [`spec/SPEC.md`](spec/SPEC.md).
