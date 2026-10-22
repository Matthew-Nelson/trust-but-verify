# Method

## The problem

AI agents can now write working software in languages their operator can't read. That moves the bottleneck from *writing* code to *trusting* it. Reading the code doesn't solve this: if I can't read Rust, I can't review Rust. Re-running the agent and asking "are you sure?" doesn't solve it either.

The question this repo answers: **how do you produce evidence, which a skeptical third party can reproduce, that software you didn't write and can't read does what it should?**

The subject is a small URL shortener with click analytics. Its API is in Rust, a language I don't know, and it has a minimal web UI. The app is deliberately ordinary. The verification around it is the work.

## The trust chain

Trust is a chain, and each link has its own evidence:

```
 intent ──────────► spec ──────────► harness ──────────► implementation
   │                 │                  │                      │
 I decide what    an adversarial     mutants prove the      passes public tests,
 "correct" means  review finds       harness catches        hidden holdout tests,
                  ambiguities;       real bugs; nobody      fuzzing, and
                  I sign off         who wrote it saw       invariants under load
                                     the code
```

A defect gets through only if every link misses it. The weakest link is the spec, because a wrong spec is faithfully tested and faithfully implemented. It's also the only link that needs human judgment, so that's where my time goes.

## Roles and isolation

Each role is an agent with a deliberately limited view. Where possible the isolation is **physical**: the agent works in a directory that doesn't contain what it mustn't see, rather than being told not to look.

| Role | Sees | Never sees | Produces |
|---|---|---|---|
| Spec author (coordinator + me) | everything | — | `spec/` |
| Spec reviewer | `spec/` only | — | ambiguity report |
| Harness author | `spec/` only (separate directory; no code exists yet) | implementations, mutants | public suite + **hidden holdout suite** |
| Implementers (api, web) | `spec/`, public harness | holdout suite | `impls/` |
| Red team | `spec/`, `impls/` (exported copy) | any harness | `mutants/` (deliberate bugs) |
| Verifier (coordinator) | everything | — | `reports/` |
| Me | the spec, the report, the running app | (the Rust, by choice) | spec sign-off, human acceptance |

Roles use **different models** where possible, so their blind spots are less likely to line up. Every prompt each agent received is in `provenance/prompts/`. Each run (model, date, inputs, outputs, commit range) is logged in `provenance/LOG.md`.

## Phases (each ends in a git tag)

| Tag | Phase | Why the order matters |
|---|---|---|
| `spec-v1` | Spec drafted, adversarially reviewed, signed off | Intent is fixed before anything is built against it |
| `harness-v1` | Harness written from the spec alone | `git log` proves the tests existed before the first line of implementation, so they can't have been shaped to fit it |
| `impl-v1` | Rust api and web UI built to pass the public harness | Implementers can run the public tests but can't edit them (CI fails if `harness/` changes) |
| `mutants-v1` | Red team writes deliberately broken variants without seeing the tests | The red team can't aim at known gaps, and the harness author can't aim at known mutants |
| `verified-v1` | Holdout suite revealed, all evidence collected, report published | The holdout is committed only after `impl-v1`, so the implementation can't have been tuned to it |

## Evidence

| Doubt | Evidence | Independent of the implementer? |
|---|---|---|
| Does it meet each requirement? | Black-box acceptance tests over HTTP and the browser, each tagged with a requirement ID | Yes. Written before the code, by a different agent |
| Was it overfitted to the visible tests? | **Holdout suite**: the same requirements with different inputs, hidden until after `impl-v1`. A gap between public and holdout pass rates is the overfitting signal | Yes |
| Does it honor the contract on inputs nobody thought of? | **Schemathesis** property-based fuzzing from `openapi.json` | Yes. A third-party tool, not an LLM |
| Does it hold up under concurrency? | Invariant tests: exactly one winner in an alias race; zero lost clicks across 500 concurrent redirects | Yes |
| **Can the tests actually catch bugs?** | **Mutant zoo**: plausible bugs (37 in this round; the plan said about 20) written by a red team that never saw the tests. Kill rate, and whether the *targeted* requirement's test is the one that caught it | Yes |
| How thorough are the implementer's own tests? | `cargo-mutants` against the Rust unit and integration tests (reported separately; it measures the implementer's tests, not the harness) | No. Reported for context only |
| Known hazards in code and dependencies? | Rust compiler, `clippy -D warnings`, `#![forbid(unsafe_code)]`, `cargo audit` (`cargo deny` was planned but is not run; npm dependencies are not audited) | Yes. Tools |
| Can anyone reproduce this? | `make verify` from a clean clone (it adds a new mutant round and never overwrites a recorded one); GitHub Actions on every push; report published to GitHub Pages on release once the owner turns publishing on | Yes |
| Does it do what a person expects? | A written human acceptance checklist I run against the live app | Yes. Me |

## Testability as a design input

Some requirements can't be observed from outside. "Clicks from yesterday count toward yesterday" can't be tested over HTTP, because a test can't make a click happen yesterday. Rather than skip them, the spec makes the database schema part of the contract, and those tests seed backdated rows directly. They're labeled **gray-box** in the report. Requirements that can only be checked by breaking the code, such as "a failed click insert never breaks the redirect", are verified by a mutant and labeled that way. No requirement silently goes unverified.

## Threats to validity

What could make this evidence misleading, and what reduces each risk:

- **The spec is wrong.** Mitigations: adversarial review and my sign-off. Remaining risk: this is the irreducible human part.
- **Same-family models share blind spots.** All agents are LLMs, so independence between them is weaker than between unrelated humans. Mitigations: different models per role, a non-LLM fuzzer, mutants measured with numbers rather than by opinion.
- **The coordinator knows everything.** The session that wrote the prompts saw all phases, so it could leak hints between roles through how the prompts are worded. Mitigations: prompts are published for inspection, the red team gets bug *categories* rather than specific bugs, and the harness author works only from the spec.
- **"Didn't look" isn't the same as "couldn't look."** Implementers run on the same machine as the hidden holdout. Mitigations: the holdout lives outside the repo, and agent transcripts are searched afterward for any access to it. The audit result is in the report.
- **The test environment isn't production.** Results cover a single instance on local Postgres, not scale, network faults or a hostile internet.
- **Gray-box tests couple to the schema.** A correct implementation with a different schema would fail them. That's accepted, and the schema is declared in the spec.

## What a passing report does **not** claim

It doesn't claim the code is bug-free. It doesn't claim the app is secure against threats outside the spec (there's no auth or rate limiting). It doesn't claim it performs at scale. It doesn't claim I can maintain the Rust. It claims this: **the implementation conforms to a reviewed spec, as measured by tests that were written independently, shown able to catch bugs, and reproducible by anyone.**
