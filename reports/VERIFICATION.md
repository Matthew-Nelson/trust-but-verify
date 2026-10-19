# Verification report

Generated 2026-10-19T05:28:09.907Z by `tools/report.mjs` from the raw evidence in `reports/raw/`. Implementation `impl-v1`, spec `spec-v1.5`, harness `harness-v1.2`, holdout seal 3.

## Summary

| Evidence | Result |
|---|---|
| Requirements | 64 verified, 8 gray-box verified (of 72) |
| Public suites (api, invariants, UI), 3 repeated clean runs each | 417 of 417 tests passed in every run |
| Holdout (hidden until after `impl-v1`) | 106 of 106 tests passed in every run |
| Fuzzing (Schemathesis, R-OAS-1) | 1912/1912, 1912/1912, 1912/1912 generated cases passed per run |
| Mutants, run-0 (harness-v1.1) | **34 of 37 killed** (91.9%); 33 by a test carrying the mutant's requirement ID |
| Mutants, run-1 (harness-v1.2) | **37 of 37 killed** (100.0%); 36 by a test carrying the mutant's requirement ID |
| Static and implementer checks | 9 of 9 pass (none failing) |
| cargo-mutants (implementer's own tests, context only) | 174 caught, 9 missed, 7 timeout, 14 unviable |

## Suites across repeated clean runs

Each run starts from fresh databases. Gray-box variables (`DATABASE_URL`, `API_BIN`) are set, so nothing is pending.

| Suite | Tests | Passed in every run | Failed in some run | Skipped | Runs |
|---|---|---|---|---|---|
| api | 374 | 374 | 0 | 0 | 3 |
| invariants | 8 | 8 | 0 | 0 | 3 |
| holdout | 91 | 91 | 0 | 0 | 3 |
| fuzz | 14 | 14 | 0 | 0 | 3 |
| ui | 35 | 35 | 0 | 0 | 3 |
| holdout-ui | 15 | 15 | 0 | 0 | 3 |

## Mutants

**How to read the rounds.** run-0 measured the harness as frozen before anyone saw a mutant: that is the first-shot number. Its survivors were then described in spec terms only (requirement and undetected behavior, no patch) to a fresh harness author who never saw the implementation or the mutants, the resulting tests were reviewed blind, and run-1 re-ran every mutant against the new harness with fresh baselines. Later rounds are therefore not independent of earlier ones: they show the gaps were closable from the spec, not that the harness would have caught these bugs unaided.

Each mutant is a realistic bug written by a red team (Fable) that never saw the harness or the holdout. A mutant is **killed** when a test that passed in every clean baseline run fails; tests that failed in any baseline are excluded (unstable). **Targeted** means a killing test carries the mutant's requirement ID; **incidental** means only tests for other requirements caught it.

| Mutant | Requirement | Red-team guess | run-0 | run-1 | Caught by |
|---|---|---|---|---|---|
| 01-url-length-bytes<br>URL limit counted in UTF-8 bytes, not code points; 2048-code-point non-ASCII URL rejected | R-URL-3 | hard | killed (targeted) | killed (targeted) | api 1, holdout 1 |
| 02-alias-max-length-exclusive<br>`3..32` instead of `3..=32`; a 32-character alias gets 422 | R-ALIAS-1 | medium | killed (targeted) | killed (targeted) | api 1, holdout 1 |
| 03-body-limit-off-by-one<br>body of exactly 65,536 bytes rejected with 400 | R-ERR-2 | medium | killed (targeted) | killed (targeted) | api 1, holdout 1 |
| 04-query-integer-lenient-parse<br>plain `parse::<i64>()`: `limit=05`, `limit=+5`, `days=007` accepted instead of 400 | R-ERR-3 | medium | killed (targeted) | killed (targeted) | api 3, holdout 1 |
| 05-stats-window-start-exclusive<br>daily buckets use `>` at the window start; a click at exactly 00:00:00Z of the first day is dropped | R-STATS-3 | medium | killed (targeted) | killed (targeted) | api 2, holdout 1 |
| 06-devices-window-extra-day<br>`devices` window starts one day early (days+1 days); other fields keep the right window | R-STATS-6 | hard | killed (targeted) | killed (targeted) | api 1 |
| 07-device-mobi-substring<br>mobile rule matches `mobile`, not `mobi`; "Opera Mobi" becomes desktop | R-CLICK-3 | hard | killed (targeted) | killed (targeted) | api 1 |
| 08-referrer-ip-host-direct<br>referrer host via `Url::domain()`; IP-literal referrers recorded as `direct` | R-CLICK-1 | hard | killed (targeted) | killed (targeted) | api 2, holdout 1 |
| 09-country-duplicate-header-first-wins<br>duplicated country header uses the first value instead of `unknown` | R-CLICK-2 | medium | killed (targeted) | killed (targeted) | api 1, holdout 1 |
| 10-url-unicode-trim<br>`str::trim()` strips NBSP/VT etc.; `" https://…"` gets 201 instead of 422 | R-URL-1 | hard | killed (targeted) | killed (targeted) | api 3, holdout 1 |
| 11-self-host-check-includes-port<br>self-reference check compares authority (host:port); `http://localhost:9999/x` accepted | R-URL-4 | medium | killed (targeted) | killed (targeted) | api 1, holdout 1 |
| 12-url-validated-before-alias-type<br>URL validated before the alias type check; `{"url":"nope","alias":5}` → 422 not 400 | R-ERR-2 | hard | killed (targeted) | killed (targeted) | api 1 |
| 13-stats-lookup-before-query-validation<br>stats looks the code up before validating `days`; unknown code + bad days → 404 not 400 | R-ERR-6 | medium | killed (incidental) | killed (incidental) | api 2 |
| 14-trailing-slash-tolerated<br>one trailing slash stripped; `/api/links/` and `/{code}/` match | R-ROUTE-1 | medium | killed (targeted) | killed (targeted) | api 7, holdout 1 |
| 15-stats-route-no-percent-decode<br>stats route skips percent-decoding; `/api/links/pct%2Dx/stats` → 404 | R-ERR-5 | medium | killed (targeted) | killed (targeted) | api 1 |
| 16-dot-segment-uppercase-escape<br>only lowercase `%2e` counts as a dot; `PUT /%2E` → 405 instead of 404 | R-ROUTE-2 | hard | killed (targeted) | killed (targeted) | holdout 1 |
| 17-blank-alias-treated-as-none<br>whitespace-only alias treated as absent; `"   "` yields a generated code instead of 422 | R-LINK-3 | medium | killed (targeted) | killed (targeted) | api 1, holdout 2 |
| 18-alias-check-then-upsert<br>SELECT-then-`ON CONFLICT DO UPDATE`; concurrent same-alias creates can all get 201, last url wins | R-ALIAS-5 | medium (probabilistic) | killed (targeted) | killed (targeted) | invariants 2 |
| 19-click-writer-backpressure-drops<br>4-permit `try_acquire` around the click insert drops clicks under load; single clicks fine | R-REDIR-5 | medium (probabilistic) | killed (targeted) | killed (targeted) | api 19, invariants 1, holdout 9 |
| 20-health-cached-3s<br>healthy `/healthz` result reused for 3 s without querying the database | R-HEALTH-3 | medium | killed (targeted) | killed (targeted) | api 1 |
| 21-head-redirect-missing-cache-control<br>`Cache-Control: no-store` only on GET; HEAD 302 lacks it | R-REDIR-7 | medium | killed (targeted) | killed (targeted) | api 2, holdout 1 |
| 22-allow-missing-head-on-link<br>405 on `/api/links/{code}` advertises `Allow: GET, DELETE` (no HEAD) | R-ERR-8 | medium | killed (targeted) | killed (targeted) | api 4, holdout 1 |
| 23-healthz-405-text-plain<br>unsupported method on `/healthz` returns the text/plain 405, not JSON | R-ERR-1 | medium | killed (targeted) | killed (targeted) | api 3, holdout 1 |
| 24-internal-error-message-detail<br>500 `message` carries the internal error detail | R-ERR-7 | easy (once a 500 is triggered: dead database → `GET /api/links`) | **survived** | killed (targeted) | api 1 |
| 25-alias-taken-echoes-alias<br>409 message names the requested alias | R-ERR-4 | medium | killed (targeted) | killed (targeted) | api 3, invariants 3, holdout 1 |
| 26-click-insert-failure-breaks-redirect<br>click insert awaited with `?`; a failed insert turns the redirect into a 500 | R-REDIR-6 | medium (gray-box trigger: `CHECK (false) NOT VALID` on `clicks`) | **survived** | killed (targeted) | api 1 |
| 27-click-insert-retry-delays-redirect<br>inline insert with 3 retries and 1 s sleeps; a failing insert delays the 302 by ~3 s | R-REDIR-6 | medium (same trigger) | **survived** | killed (targeted) | api 1 |
| 28-direct-stored-literally<br>`referrer_host` stores `'direct'` instead of NULL; API output identical | R-DATA-2 | medium (gray-box only) | killed (targeted) | killed (targeted) | api 2 |
| 29-last-clicked-at-millis<br>timestamps formatted to milliseconds; `lastClickedAt` loses stored microseconds | R-GET-1 | hard | killed (targeted) | killed (targeted) | api 2, holdout 1 |
| 30-top-countries-limit-10<br>`topCountries` returns up to 10 entries | R-STATS-5 | medium | killed (targeted) | killed (targeted) | api 2, holdout 1 |
| 31-list-tiebreak-id-asc<br>list tie-break `id ASC` for equal `createdAt` | R-LIST-1 | hard | killed (targeted) | killed (targeted) | api 1 |
| 32-ui-multiple-confirm-open<br>per-row confirm state; several "Confirm delete" buttons can be open at once | R-UI-6 | medium | killed (targeted) | killed (targeted) | ui 1 |
| 33-ui-scheme-regex-lowercase-http-only<br>scheme test is `^https?://`; `HTTP://x.com` gets prefixed to `https://HTTP://x.com` | R-UI-2 | medium | killed (targeted) | killed (targeted) | ui 4, holdout-ui 1 |
| 34-ui-days-number-parse<br>`days` parsed with `Number()`; `007`, `+7`, `7.0`, `1e1` honored instead of 30 | R-UI-8 | hard | killed (targeted) | killed (targeted) | ui 1, holdout-ui 1 |
| 35-ui-whitespace-destination-hits-server<br>only `""` is caught client-side; whitespace-only destination triggers the action POST | R-UI-12 | medium | killed (targeted) | killed (targeted) | ui 1, holdout-ui 1 |
| 36-ui-created-rounds-minute<br>Created column rounds to the nearest minute instead of truncating seconds | R-UI-5 | hard | killed (targeted) | killed (targeted) | ui 2 |
| 37-ui-click-counts-thousands-separators<br>"Total clicks: 1,234" with separators once a link has 1,000+ clicks | R-UI-7 | hard | killed (targeted) | killed (targeted) | ui 1 |

## Traceability

One row per requirement ID in `spec/SPEC.md`. Statuses: **verified** (a black-box test passed in every run), **gray-box verified** (only gray-box tests cover it), **mutant-verified only**, **failing**, **pending**, **unverified**. A skipped gray-box test is never a pass.

| ID | Labels | Status | Evidence | Mutants |
|---|---|---|---|---|
| R-LINK-1 |  | verified | 4 test(s), each passing in all 3+ run(s) of its suite |  |
| R-LINK-2 |  | verified | 2 test(s), each passing in all 3+ run(s) of its suite |  |
| R-LINK-3 |  | verified | 12 test(s), each passing in all 3+ run(s) of its suite | 17-blank-alias-treated-as-none: killed (targeted) |
| R-LINK-4 |  | verified | 2 test(s), each passing in all 3+ run(s) of its suite |  |
| R-LINK-5 |  | verified | 2 test(s), each passing in all 3+ run(s) of its suite |  |
| R-LINK-6 |  | verified | 2 test(s), each passing in all 3+ run(s) of its suite |  |
| R-LINK-7 | partly unverifiable | verified | 4 test(s), each passing in all 3+ run(s) of its suite |  |
| R-LINK-8 |  | verified | 3 test(s), each passing in all 3+ run(s) of its suite |  |
| R-URL-1 |  | verified | 11 test(s), each passing in all 3+ run(s) of its suite | 10-url-unicode-trim: killed (targeted) |
| R-URL-2 |  | verified | 31 test(s), each passing in all 3+ run(s) of its suite |  |
| R-URL-3 |  | verified | 8 test(s), each passing in all 3+ run(s) of its suite | 01-url-length-bytes: killed (targeted) |
| R-URL-4 |  | verified | 3 test(s), each passing in all 3+ run(s) of its suite | 11-self-host-check-includes-port: killed (targeted) |
| R-URL-5 |  | verified | 22 test(s), each passing in all 3+ run(s) of its suite |  |
| R-ALIAS-1 |  | verified | 41 test(s), each passing in all 3+ run(s) of its suite | 02-alias-max-length-exclusive: killed (targeted) |
| R-ALIAS-2 |  | verified | 22 test(s), each passing in all 3+ run(s) of its suite |  |
| R-ALIAS-3 |  | verified | 3 test(s), each passing in all 3+ run(s) of its suite |  |
| R-ALIAS-4 |  | verified | 8 test(s), each passing in all 3+ run(s) of its suite |  |
| R-ALIAS-5 | probabilistic | verified | 4 test(s), each passing in all 3+ run(s) of its suite | 18-alias-check-then-upsert: killed (targeted) |
| R-ERR-1 |  | verified | 2 test(s), each passing in all 3+ run(s) of its suite | 23-healthz-405-text-plain: killed (targeted) |
| R-ERR-2 |  | verified | 46 test(s), each passing in all 3+ run(s) of its suite | 03-body-limit-off-by-one: killed (targeted); 12-url-validated-before-alias-type: killed (targeted) |
| R-ERR-3 |  | verified | 16 test(s), each passing in all 3+ run(s) of its suite | 04-query-integer-lenient-parse: killed (targeted) |
| R-ERR-4 |  | verified | 3 test(s), each passing in all 3+ run(s) of its suite | 25-alias-taken-echoes-alias: killed (targeted) |
| R-ERR-5 |  | verified | 11 test(s), each passing in all 3+ run(s) of its suite | 15-stats-route-no-percent-decode: killed (targeted) |
| R-ERR-6 |  | verified | 19 test(s), each passing in all 3+ run(s) of its suite | 13-stats-lookup-before-query-validation: killed (incidental) |
| R-ERR-7 | gray-box, mutant-verified | gray-box verified | 1 test(s), each passing in all 3+ run(s) of its suite | 24-internal-error-message-detail: killed (targeted) |
| R-ERR-8 |  | verified | 13 test(s), each passing in all 3+ run(s) of its suite | 22-allow-missing-head-on-link: killed (targeted) |
| R-LIST-1 |  | verified | 12 test(s), each passing in all 3+ run(s) of its suite | 31-list-tiebreak-id-asc: killed (targeted) |
| R-LIST-2 |  | verified | 13 test(s), each passing in all 3+ run(s) of its suite |  |
| R-GET-1 |  | verified | 6 test(s), each passing in all 3+ run(s) of its suite | 29-last-clicked-at-millis: killed (targeted) |
| R-DEL-1 |  | verified | 5 test(s), each passing in all 3+ run(s) of its suite |  |
| R-DEL-2 |  | verified | 3 test(s), each passing in all 3+ run(s) of its suite |  |
| R-REDIR-1 |  | verified | 15 test(s), each passing in all 3+ run(s) of its suite |  |
| R-REDIR-2 |  | verified | 2 test(s), each passing in all 3+ run(s) of its suite |  |
| R-REDIR-3 |  | verified | 13 test(s), each passing in all 3+ run(s) of its suite |  |
| R-REDIR-4 |  | verified | 5 test(s), each passing in all 3+ run(s) of its suite |  |
| R-REDIR-5 | probabilistic | verified | 2 test(s), each passing in all 3+ run(s) of its suite | 19-click-writer-backpressure-drops: killed (targeted) |
| R-REDIR-6 | gray-box, mutant-verified | gray-box verified | 1 test(s), each passing in all 3+ run(s) of its suite | 26-click-insert-failure-breaks-redirect: killed (targeted); 27-click-insert-retry-delays-redirect: killed (targeted) |
| R-REDIR-7 |  | verified | 6 test(s), each passing in all 3+ run(s) of its suite | 21-head-redirect-missing-cache-control: killed (targeted) |
| R-REDIR-8 |  | verified | 3 test(s), each passing in all 3+ run(s) of its suite |  |
| R-REDIR-9 |  | verified | 10 test(s), each passing in all 3+ run(s) of its suite |  |
| R-ROUTE-1 |  | verified | 4 test(s), each passing in all 3+ run(s) of its suite | 14-trailing-slash-tolerated: killed (targeted) |
| R-ROUTE-2 |  | verified | 43 test(s), each passing in all 3+ run(s) of its suite | 16-dot-segment-uppercase-escape: killed (targeted) |
| R-ROUTE-3 |  | verified | 16 test(s), each passing in all 3+ run(s) of its suite |  |
| R-CLICK-1 |  | verified | 34 test(s), each passing in all 3+ run(s) of its suite | 08-referrer-ip-host-direct: killed (targeted) |
| R-CLICK-2 |  | verified | 21 test(s), each passing in all 3+ run(s) of its suite | 09-country-duplicate-header-first-wins: killed (targeted) |
| R-CLICK-3 |  | verified | 28 test(s), each passing in all 3+ run(s) of its suite | 07-device-mobi-substring: killed (targeted) |
| R-PRIV-1 | gray-box | gray-box verified | 2 test(s), each passing in all 3+ run(s) of its suite |  |
| R-STATS-1 |  | verified | 14 test(s), each passing in all 3+ run(s) of its suite |  |
| R-STATS-2 | gray-box | verified | 16 test(s), each passing in all 3+ run(s) of its suite |  |
| R-STATS-3 | gray-box | verified | 4 test(s), each passing in all 3+ run(s) of its suite | 05-stats-window-start-exclusive: killed (targeted) |
| R-STATS-4 |  | verified | 4 test(s), each passing in all 3+ run(s) of its suite |  |
| R-STATS-5 |  | verified | 5 test(s), each passing in all 3+ run(s) of its suite | 30-top-countries-limit-10: killed (targeted) |
| R-STATS-6 |  | verified | 4 test(s), each passing in all 3+ run(s) of its suite | 06-devices-window-extra-day: killed (targeted) |
| R-DATA-1 | gray-box | gray-box verified | 2 test(s), each passing in all 3+ run(s) of its suite |  |
| R-DATA-2 | gray-box | gray-box verified | 3 test(s), each passing in all 3+ run(s) of its suite | 28-direct-stored-literally: killed (targeted) |
| R-DATA-3 | gray-box | gray-box verified | 1 test(s), each passing in all 3+ run(s) of its suite |  |
| R-HEALTH-1 |  | verified | 3 test(s), each passing in all 3+ run(s) of its suite |  |
| R-HEALTH-2 | gray-box, partly unverifiable | gray-box verified | 2 test(s), each passing in all 3+ run(s) of its suite |  |
| R-HEALTH-3 | gray-box | gray-box verified | 1 test(s), each passing in all 3+ run(s) of its suite | 20-health-cached-3s: killed (targeted) |
| R-OAS-1 |  | verified | 14 test(s), each passing in all 3+ run(s) of its suite |  |
| R-UI-1 |  | verified | 2 test(s), each passing in all 3+ run(s) of its suite |  |
| R-UI-2 |  | verified | 9 test(s), each passing in all 3+ run(s) of its suite | 33-ui-scheme-regex-lowercase-http-only: killed (targeted) |
| R-UI-3 |  | verified | 2 test(s), each passing in all 3+ run(s) of its suite |  |
| R-UI-4 | partly unverifiable | verified | 8 test(s), each passing in all 3+ run(s) of its suite |  |
| R-UI-5 | partly unverifiable | verified | 6 test(s), each passing in all 3+ run(s) of its suite | 36-ui-created-rounds-minute: killed (targeted) |
| R-UI-6 |  | verified | 2 test(s), each passing in all 3+ run(s) of its suite | 32-ui-multiple-confirm-open: killed (targeted) |
| R-UI-7 |  | verified | 4 test(s), each passing in all 3+ run(s) of its suite | 37-ui-click-counts-thousands-separators: killed (targeted) |
| R-UI-8 |  | verified | 5 test(s), each passing in all 3+ run(s) of its suite | 34-ui-days-number-parse: killed (targeted) |
| R-UI-9 |  | verified | 3 test(s), each passing in all 3+ run(s) of its suite |  |
| R-UI-10 |  | verified | 7 test(s), each passing in all 3+ run(s) of its suite |  |
| R-UI-11 |  | verified | 1 test(s), each passing in all 3+ run(s) of its suite |  |
| R-UI-12 | partly unverifiable | verified | 2 test(s), each passing in all 3+ run(s) of its suite | 35-ui-whitespace-destination-hits-server: killed (targeted) |

## Static and implementer checks

Tool versions: rustc `rustc 1.99.1 (58cf8f9c3 2026-10-13)`, cargo-audit `cargo-audit-audit 0.22.2`, node `v22.19.0`, pnpm `11.20.0`.

| Check | Result | Command |
|---|---|---|
| forbid(unsafe_code) | pass | `grep main.rs` (impls/api) |
| cargo fmt --check | pass | `cargo fmt --check` (impls/api) |
| cargo clippy -D warnings | pass | `cargo clippy --all-targets -- -D warnings` (impls/api) |
| cargo test | pass | `cargo test` (impls/api) |
| cargo audit | pass | `cargo audit` (impls/api) |
| web: pnpm install | pass | `pnpm install --frozen-lockfile` (impls/web) |
| web: pnpm lint | pass | `pnpm lint` (impls/web) |
| web: pnpm build | pass | `pnpm build` (impls/web) |
| web: pnpm typecheck (after build) | pass | `pnpm typecheck` (impls/web) |

## cargo-mutants (implementer-test quality)

This measures the implementer's own Rust tests, not the independent harness, and is reported for context only.

Caught 174, missed 9, timeout 7, unviable 14. Command: `SQLX_OFFLINE=true DATABASE_URL=<fresh db> cargo mutants --in-place --timeout 120 (impls/api)`.

## Isolation audit

**Method.** Every subagent transcript (JSONL) was parsed, and every tool call's input was checked:
- **Absolute paths:** each one was checked against an allowlist for the role (its workspace, package and browser caches, temp directories, system binaries).
- **Bash commands:** each one was also scanned for URLs, relative `cd` escapes, and references to the repo, other workspaces or holdout locations.
- **Positive control:** every audit counts the agent's references to its own workspace, so a zero for forbidden paths can't come from a broken scan.

Per-run details are in `provenance/LOG.md`.

**Consolidated holdout scan at reveal.** Every subagent transcript in the project was searched for holdout locations (`tbv-holdout*`, the `pre-run5/6/7` snapshots, coordinator holdout output, `/holdout/`). Only the harness author, which wrote the holdout, touched it. Every other role, including both spec reviewers, the harness reviewer, both implementers and the red team, has **0** holdout references.

| Role (run) | Model | Workspace | Result |
|---|---|---|---|
| Spec reviewers (1, 2) | Opus, Fable | spec only | clean |
| Harness author (4–7, 10) | Opus | spec only, plus public tool docs | clean. Run 10 fetched Schemathesis 4.29.1 source from GitHub with `curl` (public docs were in scope). |
| Harness reviewer (5b, 7b, 10b) | Fable | spec, dispositions, public harness | clean, with 0 holdout references. A prompt slip in run 5b named a repo path. The audit shows it was never accessed. |
| Api implementer (8) | Sonnet | worktree `impl-api` | clean, with 0 holdout references. It wrote one log to `/tmp/x` (self-reported). |
| Web implementer (9) | Sonnet | worktree `impl-web` | clean, with 0 holdout references |
| Red team (11) | Fable | spec plus an `impls/` export | clean: no harness, holdout or repo access, and no database connection |
| Gap-round harness author (12, 12b) | Opus (fresh) | spec plus public harness only | clean: no implementation, mutant, holdout or repo access; it re-read only its own saved tool outputs |
| Harness reviewer, round 4 (12c) | Fable | spec, dispositions, harness diff | clean |

**Incidents, all contained and logged:**
- **Shared scratchpad.** The coordinator's session scratchpad, which every subagent receives as its temp directory, held harness-workspace snapshots that included holdout copies. A re-audit showed that no agent listed or read them. They were moved to a coordinator-only directory before the round-3 review.
- **Real-api output in the author's workspace.** The coordinator once ran the fuzz suite against the real api from the harness author's workspace after that author had finished. The outputs were moved out right away and never imported or exported.
- **Shared tool-output directory.** Claude Code saves long tool outputs in a per-session directory that all agents in the session can read. A scan of every transcript found no agent reading a saved output it hadn't produced itself.
- **A harness detail in the frozen code.** The implementation itself mentions one harness detail (the R-UI-1 `required` check), and the red team could read it. It was left in, because mutants must apply to `impl-v1` exactly.

**Residual.** This audit shows what the agents *did*, not what they *could* have done. All roles ran on one machine with the same file permissions, so "didn't look" isn't "couldn't look". Every agent also received the same ambient context (a memory index line describing the project's goal).

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

