# Provenance log

One row per agent run. "Could see" describes the workspace actually given to the agent, not just what its prompt said.

| # | Date | Phase | Role | Model | Workspace / could see | Could not see | Output (commits / tag) | Transcript |
|---|---|---|---|---|---|---|---|---|
| 0 | 2026-10-17 | spec | coordinator | claude-opus-5-5 | everything (old repos for context) | — | spec draft, METHOD, prompts (commit `60960c0`) | this session |
| 1 | 2026-10-17 | spec review | spec reviewer | Opus (fresh context, background subagent) | `tbv-ws/spec-review/spec/{SPEC.md,openapi.json}`, a copy of `60960c0` | repo, METHOD, prompts (by instruction; transcript to be audited) | `spec/reviews/01-opus-adversarial.md` (56 findings: 7 blocking, 33 disagreement, 16 minor), copied unmodified | subagent transcript (audited) |
| 2 | 2026-10-17 | spec review | spec reviewer (round 2, blind) | Fable (fresh context, background subagent) | `tbv-ws/spec-review-2/spec/{SPEC.md,openapi.json}`, a copy of `50fa7c2` | repo, review #1 and its disposition, METHOD, prompts | `spec/reviews/02-fable-adversarial.md` (32 findings: 3 blocking, 14 disagreement, 15 minor), copied unmodified | subagent transcript (audited) |
| 3 | 2026-10-17 | sign-off | Matthew (human) | — | spec, both reviews, both dispositions | — | approved in session ("looks good to me"), then asked the coordinator to create the tag; tag `spec-v1` | this session |
| 4 | 2026-10-17 | harness | harness author | Opus (fresh context, background subagent) | `tbv-ws/harness/spec/{SPEC.md,openapi.json}` exported from `spec-v1`; npm/PyPI and public docs | repo, reviews, METHOD, other prompts, any implementation (none exists) | public harness (387 tests + fuzz script) imported to `harness/`; holdout (102 tests) sealed outside the repo (`provenance/HOLDOUT_SEAL.md`); 19 proposals (HP-01..19) | subagent transcript (audited) |
| – | 2026-10-18 | spec amendment | coordinator | claude-opus-5-5 | `PROPOSALS.md` HP-01..19 | — | `spec-v1.1` (commit `5401891`, disposition `spec/reviews/03-*`); Matthew approved amending before any code exists ("sure") | this session |
| 5 | 2026-10-18 | harness update | harness author (run 4 agent, resumed) | Opus (same agent `a1fa35d76a896a0d7`, resumed from its transcript) | `tbv-ws/harness` with `spec/` replaced by the `spec-v1.1` export and its holdout restored from the seal-1 bundle | repo, reviews, dispositions, METHOD, other prompts | public suite updated (API 346 → 372; R-UI-12 changed); holdout 102 → 105, re-sealed as seal 2; HP-20 | subagent transcript (audited) |
| 5b | 2026-10-18 | harness review | harness reviewer (sign-off gate) | Fable (fresh context, background subagent) | `tbv-ws/harness-review`: `spec-v1.1` SPEC + openapi, PROPOSALS, HP disposition, public `harness/` at `f6d203e` | repo, holdout, METHOD, other prompts | `spec/reviews/04-fable-harness-review.md`: **BLOCK** (3 blocking, 13 nits), copied unmodified; disposition `04-disposition.md`; `spec-v1.2` | subagent transcript (audited) |
| 6 | 2026-10-18 | harness update | harness author (resumed) | Opus (`a1fa35d76a896a0d7`) | `tbv-ws/harness` with `spec-v1.2`, `HARNESS_REVIEW.md`, seal-2 holdout restored | repo, dispositions, METHOD, other prompts | fixes for HR-01..16 (API 372, invariants 6 → 8, UI 35); holdout 105 → 106; HP-21, HP-22 | subagent transcript (audited) |
| 7 | 2026-10-18 | harness update | harness author (resumed) | Opus (`a1fa35d76a896a0d7`) | same workspace, `spec-v1.3` | same | R-PRIV-1 inconclusive guard (HP-21 as amended); holdout unchanged; holdout re-sealed as seal 3 | subagent transcript (audited) |
| 7b | 2026-10-18 | harness review, round 2 | harness reviewer (resumed) | Fable (same agent as 5b) | `tbv-ws/harness-review` refreshed: `spec-v1.3`, dispositions, harness `6ff8513` and both diffs, round-1 report | repo, holdout, METHOD, other prompts | `spec/reviews/05-fable-harness-review-2.md`: **SIGN-OFF WITH NITS** (0 blocking, 5 nits); disposition `05-disposition.md` | subagent transcript (audited) |
| – | 2026-10-18 | sign-off | Matthew (delegated) | — | — | — | Delegated rule met ("If they give signoff then i approve as well"); tag `harness-v1` created by the coordinator at the reviewed commit | this session |
| 8 | 2026-10-18 | build | api implementer | Sonnet (fresh context, background subagent) | worktree `tbv-wt/impl-api` (branch `impl-api` from `941db32`; harness/spec identical to `harness-v1`); Postgres DBs `shortlink`, `shortlink_fuzz`; crates.io, npm | holdout (outside the repo; transcript to be audited), the web worktree | *in progress* | subagent transcript |
| 9 | 2026-10-18 | build | web implementer | Sonnet (fresh context, background subagent) | worktree `tbv-wt/impl-web` (branch `impl-web` from `941db32`); Prism mock of `spec/openapi.json`; npm | holdout, the api worktree, the real api (not yet built) | `impl-web` @ `424b079` (1 commit, `impls/web/` only); UI harness 33/35 against the agent's throwaway fake api, 2 gray-box skipped; real-api run pending; HP-23 (harness false failure on `<button>`) | subagent transcript |

**Deviation (run 1):** the plan assigned Fable 5.1 to spec review. Matthew chose Opus. The reviewer is therefore the same model family as the spec's author, which raises the risk of shared blind spots for this review. Mitigation: the harness author also reviews the spec in practice (it must interpret every rule), and its interpretations are reported.

**Isolation audit (run 1):** the tool calls in the transcript were `Read` ×2 (`spec/SPEC.md`, `spec/openapi.json` in the workspace), `Write` ×2 (`SPEC_REVIEW.md`) and the hand-back. No other files were opened. Caveat: like every Claude Code subagent, it also received context injected automatically by the harness (the user's memory index, environment info), which includes one line describing the project's goal. "Spec-only" therefore means spec-only *by tool access*, not a perfectly blank context. Method: grep of tool-use names and input paths in the transcript JSONL.

**Isolation audit (run 2):** the tool calls were `Read` ×2 (the workspace `SPEC.md` and `openapi.json`), `Write` ×1 (`SPEC_REVIEW.md`) and the hand-back. Same ambient-context caveat as run 1.

**Prompt for run 2:** `provenance/prompts/01-spec-review.md` verbatim, preceded by the same path header as run 1 plus a round-2 paragraph: don't re-raise anything already precise; focus on remaining blockers, contradictions among the new sections, wording that is precise but wrong, and labels that don't match what a harness can verify; number findings R2-nn.

**Erratum (run 4):** the prompt `02-harness.md` predated both spec revisions (it said N=50 for R-ALIAS-5 and listed only pre-review areas). A correction was sent mid-run, and its text is appended to the prompt file. Coordinator error, caught by rereading the prompt after launch.

**Isolation audit (run 4):** the transcript was parsed as JSON (130 tool calls: Bash 79, Write 45, Read 2, WebFetch 1, others 3). Every file path in every tool input was checked against an allowlist (the workspace, package-manager and browser caches, temp dirs, system binaries). Positive control: 143 workspace references detected. The only non-allowlisted paths were `/etc/passwd` and `/var/app/x.rs`, and both turned out to be **test-input strings** (a `file:///etc/passwd` URL that must be rejected, and a path-like alias used to check that error messages don't leak paths), not file accesses. The only web fetch was the Schemathesis configuration docs. No access to the repo or to other workspaces.

**Coordinator checks on run 4 output (not the agent's own claims):** all 72 SPEC IDs appear in `COVERAGE.md`; an independent title scan found only R-ERR-7 and R-REDIR-6 without a test (both mutant-verified by SPEC), matching the agent's report. My first scan wrongly flagged 4 more IDs, because its regex missed the `test.each(...)('title')` form; this was corrected by direct inspection. Zero `.only`, unconditional `.skip`, `.todo`, `fixme`, `expect(true)` or `toBeTruthy()` in either suite. Gray-box tests are reported as *pending* (skipped), not passed.

**Leak control:** holdout self-check results were kept out of the repo, and one `SELF_CHECK.md` row naming holdout test areas was redacted (see `HOLDOUT_SEAL.md`).

**Prompt for run 5:** `provenance/prompts/02b-harness-v1.1.md` verbatim. It listed each HP resolution, but not the disposition file itself.

**Isolation audit (run 5):** the transcript from the resume message onward was parsed as JSON. It had 28 tool calls: Bash 25, TaskStop 2 and the hand-back. Every absolute path in every tool input was checked against the same allowlist as run 4, with 28 workspace references detected as a positive control. No non-allowlisted paths. No web access. Relative paths were also scanned: the only `cd ..` stayed inside the workspace, moving from `harness/` to the workspace root to read `spec/openapi.json`.

**Coordinator checks on run 5 output:**
- **Removed lines.** A diff against a snapshot taken before the run shows that the only assertions removed from either suite are the two R-UI-12 "zero requests of any kind" assertions (public and holdout), which `spec-v1.1` requires removing.
- **R-UI-11 still covered.** The holdout test that lost its `[R-UI-11]` title tag is still covered, because the R-UI-11 network capture is an automatic fixture on every UI test.
- **Self-check, re-run by the coordinator.** With nothing listening: API 372, of which 355 failed, 17 skipped and 0 passed. Holdout: Vitest 90, of which 88 failed, 2 skipped and 0 passed, plus Playwright 15 of 15 failed. Both match the agent's report. Prism runs were not repeated. `reports/raw/harness-self-check/api.json` is from this coordinator re-run; the other files there are the agent's.
- **Coverage.** All 72 `spec-v1.1` IDs are in COVERAGE.md. Three have no test title: R-ERR-7 and R-REDIR-6, both mutant-verified, and R-OAS-1, which is covered by `pnpm fuzz`.
- **Weakening scan.** No `.only`, `.todo`, `fixme`, `expect(true)` or `toBeTruthy()`. The only `test.skip` calls are conditional gray-box skips.

**Leak control (run 5):**
- The workspace copy of `SELF_CHECK.md` still had the unredacted holdout row, so the redaction was re-applied on import.
- All 68 `[R-…` string literals in the sealed holdout were searched for in the repo. The only 3 found are generic parameterized templates (`[R-CLICK-1] Referer %s -> %j`, `[R-CLICK-3] User-Agent %s -> %j`, `[R-LINK-3] alias `). They also appear in the public suite, filled with different inputs. The first extractor used for this check missed 4 titles; the broader literal scan replaced it.
- `prism.log` was not imported, because it may contain holdout requests.
- Holdout results and the holdout itself were moved out of the workspace into the seal-2 bundle.

**Prompt updates before `harness-v1` (2026-10-18):**
- `03-api` no longer tells the implementer to use axum's `Json` and `Query` extractors, which would contradict R-ERR-2 and the query-integer rule. It now names the stack defaults that break SPEC (HEAD runs the GET handler, routing and decoding, logging the client address), adds `API_BIN`/`FUZZ_API`, and requires gray-box tests to run rather than skip.
- `04-web` requires a client-side R-UI-12 check and a production build.
- `05-redteam` requires a mutant for every mutant-paired ID.
- `06-verify` verifies both seals and reports skipped gray-box tests as pending (HP-20).
- Coordinator's own review against `spec-v1.1`. No agent had used these prompts yet.

**Sign-off delegation (run 5b):** Matthew: "spawn a review agent. If they give signoff then i approve as well." A BLOCK therefore goes to fixes and re-review, not to tagging.

**Prompt for run 5b:** `provenance/prompts/07-harness-review.md`, passed verbatim inside the agent prompt. Coordinator slip: the first line of the agent prompt named the repo path of that prompt file, then told the agent not to open it. That disclosed where the repo is.

**Isolation audit (run 5b):** 72 tool calls (Read 58, Bash 12, Write 1, hand-back 1), with 72 workspace references detected as a positive control. There were zero paths outside the workspace: the agent did not follow the disclosed repo path. No Bash command used `../`, `$HOME` or the repo name. No web access.

**Coordinator checks on run 5b:** HR-01 and HR-02 were confirmed in the code. HR-03 was tested empirically against a throwaway axum 0.8 server with `DefaultBodyLimit::max(65536)`, through the harness's own `raw()`: 300 of 300 probes were correct at each size (65,536 → 201, 65,537 → 400, 200,000 → 400). It did not reproduce, so it was downgraded to a nit, per the reviewer's own rule.

**Prompts for runs 6 and 7:** `provenance/prompts/02c-harness-review-fixes.md` and `02d-harness-priv-guard.md`, verbatim.

**Isolation audits (runs 6 and 7):** the same JSON parse and allowlist as run 5. Run 6 had 35 tool calls, with 45 workspace references detected as a positive control. Run 7 had 7 tool calls, with 9 workspace references. Neither had a non-allowlisted path, web access, or a Bash command naming the repo, the holdout bundles or another workspace. Run 6's one `cd ..` went from `harness/` to the workspace's `holdout/`.

**Coordinator checks on runs 6 and 7:**
- **Removed assertions.** Every assertion line removed in run 6 that has no exact counterpart in the new code maps to a listed fix: instant comparisons (HR-08), set comparison of columns (HR-04), the short-link selector (HR-02), the two-family address search (HR-13), and the dropped 200,000-byte probe (HR-03). The two moved list tests were checked in their new file.
- **Self-check re-run by the coordinator** with nothing listening: API 372 (355 failed, 17 skipped, 0 passed); invariants 8 (8 failed); holdout 91 Vitest (89 failed, 2 skipped) plus 15 of 15 UI failed.
- **Coverage.** All 72 `spec-v1.3` IDs are in COVERAGE.md.
- **HP-21 false pass caught.** Run 6's database-host exclusion would have dropped the plain client address when `DATABASE_URL` used `127.0.0.1`. The coordinator caught this, added the inconclusive guard to the SPEC (`spec-v1.3`), and had run 7 implement it. `canonicalForms` was exercised offline: `127.0.0.1`, `::ffff:127.0.0.1`, `::1` and `192.168.1.5` each yield their plain form as canonical.

**Leak control (runs 6 and 7):** the SELF_CHECK redaction was re-applied on import. All 69 `[R-…` literals in seal 3 were searched for in the repo, and the only matches are the same 3 generic templates. `prism.log` was not imported. The raw results contain no "holdout" text.

**Isolation audit (run 7b):** 23 tool calls (Read 14, Bash 7, Write 1, hand-back 1), with 23 workspace references detected as a positive control. Nothing outside the workspace, no web access. Its only write was `HARNESS_REVIEW_2.md`.

**Coordinator check on run 7b:** HR2-05 was tested empirically, and Vitest 4.1.11's JSON reporter drops skip notes and annotations. The resolution is in phase 6's tooling (see `05-disposition.md`), not in the harness.

**Prompt for run 1:** `provenance/prompts/01-spec-review.md` verbatim, preceded by a header giving the workspace paths, the read restriction and the output location.

## Planned model assignment
Different models per role, so blind spots are less likely to line up:

| Role | Model |
|---|---|
| Coordinator / verifier | Opus 5.5 |
| Spec reviewer | Fable 5.1 |
| Harness author | Opus 5.5 (fresh context, spec-only workspace) |
| API implementer | Sonnet 5.5 |
| Web implementer | Sonnet 5.5 |
| Red team | Fable 5.1 |

**Prompts for runs 8 and 9:** `provenance/prompts/03-04-launch-header.md` (workspace, ports, databases) followed by `03-api.md` / `04-web.md` at `941db32`, verbatim. Matthew approved starting the build without changing the HR2-01 `%2F` decision ("nah go ahead").

**Isolation audit (run 9):** 27 tool calls (Bash 22, Write 2, Edit 2, hand-back 1), with 29 worktree references detected as a positive control. No non-allowlisted path, no web access, no Bash command naming the holdout, the main checkout, `tbv-ws` or the api worktree. Every `cd` target is inside the worktree or `$TMPDIR` (its throwaway fake api); the two relative `cd ../../harness` hops go from `impls/web` to the worktree's `harness/`. The only "holdout" text is in its final report. Its commit touches only `impls/web/` (`git diff --name-only main...impl-web`).

**Coordinator checks on run 9:** HP-23 confirmed by reading the test (a `<button>` has no `required` property, so `undefined !== false`). The holdout's R-UI-1 check reads only the two textboxes and is not affected. Deviation: one commit instead of "small, logical commits". The UI's real-api result is still pending; the agent's 33/35 was against its own fake api and is not acceptance evidence.
