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
| 8 | 2026-10-18 | build | api implementer | Sonnet (fresh context, background subagent) | worktree `tbv-wt/impl-api` (branch `impl-api` from `941db32`; harness/spec identical to `harness-v1`); Postgres DBs `shortlink`, `shortlink_fuzz`; crates.io, npm | holdout (outside the repo; transcript to be audited), the web worktree | `impl-api` @ `dfde2b2`, merged into main at `0030f5d` (3 commits: `impls/api/` plus 2 appended proposals, numbered HP-23/24 on that branch, to be renumbered HP-24/25 on merge); agent reports API 372/372, invariants 8/8, fuzz 2 failures + 2 errors | subagent transcript |
| 9 | 2026-10-18 | build | web implementer | Sonnet (fresh context, background subagent) | worktree `tbv-wt/impl-web` (branch `impl-web` from `941db32`); Prism mock of `spec/openapi.json`; npm | holdout, the api worktree, the real api (not yet built) | `impl-web` @ `424b079` (1 commit, `impls/web/` only); UI harness 33/35 against the agent's throwaway fake api, 2 gray-box skipped; merged at `a4b7e77`; real-api UI run 35/35; HP-23 (harness false failure on `<button>`) | subagent transcript |
| – | 2026-10-18 | spec amendment | coordinator | claude-opus-5-5 | HP-23..25 (confirmed by coordinator runs), HR2-01/02 | — | `spec-v1.4` (commit `c771576`, disposition `spec/reviews/06-*`); Matthew chose "Blind fix + re-review" | this session |
| 10 | 2026-10-18 | harness update (post-freeze) | harness author (resumed) | Opus (`a1fa35d76a896a0d7`) | `tbv-ws/harness` with `spec-v1.4`; holdout not present | repo, implementations, their output and fuzz reports, dispositions | 3 fixes + HR2-04 (commit `8ba4d0b`, imported; SELF_CHECK redaction kept); counts unchanged (API 372, invariants 8, UI 35); HP-26 | subagent transcript (audited) | subagent transcript |
| 10b | 2026-10-18 | harness review, round 3 | harness reviewer (resumed) | Fable (same agent as 5b/7b) | `tbv-ws/harness-review` refreshed: `spec-v1.4`, dispositions 03–06, harness `8ba4d0b`, `harness-v1-to-8ba4d0b.diff`, spec diff | repo, holdout, implementations and their output | `spec/reviews/07-fable-harness-review-3.md`: **SIGN-OFF WITH NITS** (0 blocking, 4 nits), copied unmodified; disposition `07-disposition.md` | subagent transcript (audited) | subagent transcript |
| – | 2026-10-18 | sign-off | Matthew ("Blind fix + re-review") | — | — | — | Reviewer signed off; tag `harness-v1.1` created by the coordinator with harness bytes identical to the reviewed `8ba4d0b` | this session |
| – | 2026-10-18 | build freeze | coordinator | claude-opus-5-5 | `impl-web` and `impl-api` merged into `main` (`spec/` and `harness/` unchanged by the merges) | — | tag `impl-v1`; acceptance evidence in `reports/raw/impl-v1-acceptance/` | this session |

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

**Isolation audit (run 8):** 55 tool calls (Bash 47, Read 4, Write 3, hand-back 1), with 55 worktree references detected as a positive control. No non-allowlisted path, no web access, no Bash command naming the holdout, the main checkout, `tbv-ws` or the web worktree. Relative `cd ..` / `cd ../..` hops go from `impls/api` (or `src`) up to the worktree root. Deviation, self-reported: a background `cargo install` log was written to `/tmp/x`, outside the repo (not repo content; allowlisted temp dir). The commit range `main...impl-api` touches only `impls/api/` and `spec/PROPOSALS.md` (append-only, which CLAUDE.md allows).

**Coordinator verification of runs 8 and 9 (own runs, not the agents' claims):** the api was built offline (`SQLX_OFFLINE=true`, `DATABASE_URL` unset) from `dfde2b2` and run against **fresh** databases created by the coordinator (`shortlink_verify`, `shortlink_verify_fuzz`), with `DATABASE_URL` (hostname `localhost`) and `API_BIN` set. Both worktrees' `harness/` are identical to `harness-v1`.
- `pnpm test:api`: 372 of 372 passed, 0 skipped (gray-box included; R-PRIV-1 ran, not inconclusive).
- `pnpm test:invariants`: 8 of 8 passed.
- `pnpm fuzz` (`FUZZ_API` on 8081, seed 20261017): **2 failures, 2 errors**, reproducing the agent's report exactly. (1) `negative_data_rejection` on `GET`/`HEAD /api/links?...&x-schemathesis-unknown-property=42` expects a 4xx, but R-ERR-3 says undefined parameters are ignored. The SPEC's fuzzing rule ("every check except `positive_data_acceptance`") therefore contradicts R-ERR-3. (2) `--max-redirects 0` makes Schemathesis 4.29.1 (via `requests`) raise "Exceeded 0 redirects" on every 302 from `/{code}`, so no correct api can pass. Both are confirmed harness/spec defects, not api defects. Narrow fixes exist in 4.29.1: `[generation] allow-extra-parameters = false`, and a `before_call` hook that sends `allow_redirects=False` (the script currently blanks `SCHEMATHESIS_HOOKS`).
- Web (`424b079`): `pnpm lint`, `typecheck` and `build` pass. Production build against the real api: `pnpm test:ui` **35 of 35 passed**, including both gray-box tests (`DATABASE_URL` set).
- The api's logs (2,753 lines) contain no `127.0.0.1`, `::1` or `::ffff:` form.

**Prompt for run 10:** `provenance/prompts/02e-harness-v1.1.md` verbatim. It gives the SPEC reasoning for each fix and the Schemathesis option names the coordinator found in 4.29.1's source, but no implementation code, output or fuzz report.

**Isolation audit (run 10):** 74 tool calls from the resume message onward (Bash 48, Edit 14, TaskStop 6, Write 4, Read 1, hand-back 1), with 61 workspace references detected as a positive control. No non-allowlisted path. **Web access through `curl` in Bash** (not a WebFetch tool call, so the first automated pass reported "web: none"): raw.githubusercontent.com and api.github.com, all Schemathesis v4.29.1 source files. Public tool docs and source were in scope for the harness author since run 4. The audit now also scans Bash commands for URLs. It worked in the **session scratchpad** (`st/`, `dbg/`), which subagents share with the coordinator. Every scratchpad reference was checked: it never listed the scratchpad root and never read a coordinator file.

**Process gap found and closed (shared scratchpad):** the coordinator's scratchpad, which is handed to every subagent as its temp directory, held harness-workspace snapshots `pre-run5`/`6`/`7` that include **holdout copies**, plus coordinator holdout self-check output and the real-api verification logs. Re-audit of runs 8, 9 and 10: the api implementer referenced the scratchpad only for its own `api.log`, `fuzz-api.log`, `t.log` and `pid`; the web implementer's `$TMPDIR` is a separate system temp dir; run 10 used only `st/` and `dbg/`. **No agent listed or read any of these files.** All of them were moved to `/Users/matthewnelson/Workspace/tbv-coord/`, which is never given to any agent, before review round 3. Rule from here: holdout copies and implementation output never go in the scratchpad.

**Coordinator slip (run 10 verification):** the coordinator ran the new fuzz against the real api from the harness author's workspace after run 10 had finished, which wrote the real api's junit/ndjson reports and `summary.txt` to `tbv-ws/harness/harness/fuzz/out/`. They were moved to `tbv-coord/fuzz2-out/` right away. The harness author was not running, and `fuzz/out/` is excluded from every import and from the reviewer export (`git archive` of the commit). `.hypothesis/examples` was empty.

**Coordinator checks on run 10:**
- **Diff against the pre-run snapshot:** only the reported files changed. The only assertion change is R-UI-1 `toBe(false)` → `not.toBe(true)`.
- **Hook reviewed:** with `allow_redirects=False`, `requests` calls `next(resolve_redirects(...))` inside `try/except StopIteration`, so the empty-iterator replacement is safe.
- **New fuzz against the real api** (fresh `shortlink_verify_fuzz`, seed 20261017): **exit 0, 1,912 of 1,912 cases passed**, all phases green. Outputs in `tbv-coord/`.
- **HP-26** disposed with no spec change (`06-disposition.md`).

**Isolation audit (run 10b):** 11 tool calls (Bash 5, Read 4, Write 1, hand-back 1), with 11 workspace references detected as a positive control. Nothing outside the workspace, no URLs in Bash, no web tools. Its only write was `HARNESS_REVIEW_3.md`.

**Coordinator check on run 10b:** all four runs the reviewer proposed were done on a copy of `8ba4d0b` in `tbv-coord/rv3` (see `07-disposition.md`). On the first attempt pnpm refused a symlinked `node_modules` and aborted without removing anything; the harness author's install was checked intact, and a separate install was used.

**Coordinator acceptance runs at `impl-v1` (harness `harness-v1.1`, builds from `main`):** clean offline api build; `cargo fmt --check`, `clippy -D warnings`, `cargo test` (16 unit + 8 `#[sqlx::test]`) and `cargo audit` (213 crates) all clean. Web: `pnpm lint` and `build` pass. **`pnpm typecheck` fails on a fresh clone** (`Cannot find name 'LayoutProps'`) until `next build` has generated the route types, and passes after. Open item for CI: run `next typegen` (or the build) before `tsc`. The harness asserts that proxy variables are unset (HR3-02). Fresh databases.

| Suite | Result |
|---|---|
| UI (web + real api, gray-box on) | 35/35 |
| Invariants | 8/8 |
| Fuzz (dedicated instance and database) | exit 0, 1,912/1,912 |
| API (gray-box on, `API_BIN` set) | **Run 1: 4 failed, 368 passed.** Runs 2–8 and three cold-start runs: 372/372. With the pre-merge run in the worktree: **11 of 12 full runs green.** |

**Open item: intermittent API failure (run 1).** For about 3 s (02:24:12–15Z) the api served almost nothing. Then the pool reported `acquired_after_secs=3.13` and `4.35`, and two requests failed with `pool timed out while waiting for an open connection` (500 on `POST /api/links`; one click not recorded, so two tests saw `rangeClicks` 0). The four failures are in four different files at the same moment, which points to a systemic stall, not one test. Ruled out: click-recording contention (a single plain `INSERT`, and only 3 redirects in the preceding second), the gray-box blackhole (it affects only harness-spawned instances), and Postgres-side errors (none logged; lock-wait logging is off). Not reproduced in 10 later runs, three of them on a freshly started api, with pg_stat_activity sampled at 5 Hz. Run 1 was the first run after recreating the databases, directly after `cargo build`, `pnpm install`, `next build` and a Chromium download on the same machine. **Cause unknown.** Phase 6 must run each suite several times on fresh databases, report the pass rate, and either find the cause or list it under "what this does not prove". The api's 20-connection pool with a 5 s acquire timeout, shared by request handling and fire-and-forget click inserts, is a robustness weakness worth naming for the red team.
