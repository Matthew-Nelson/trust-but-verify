SIGN-OFF WITH NITS

# Harness review, round 2: `harness-v1` at commit `6ff8513` against `spec-v1.3`

Reviewer: the same independent reviewer as round 1 (`HARNESS_REVIEW.round1.md`). Static review only. Read: `spec/v1.1-to-v1.3.diff`, `spec/SPEC.md` (v1.3), `spec/PROPOSALS.md` (HP-20..22), `spec/reviews/04-disposition.md`, the full `harness-f6d203e-to-6ff8513.diff`, and the current `lib/addr.ts`, `lib/assert.ts`, `lib/spawn.ts` and `tests/api/spawned.graybox.test.ts` in full.

**Summary.** All three round-1 blockers are resolved by the fixes described, without loosening any assertion. The thirteen nits are resolved or correctly dispositioned. The v1.2/v1.3 wording is sound and consistent with the rest of SPEC. The new logic (R-PRIV-1 exclusion and inconclusive guard, the two `%2F` tests, the two moved list tests, the midnight retries) introduces no false failure, no false pass, and no dishonest reporting that I can find. Five nits remain, none of which a correct implementation could fail on or a broken one could pass on. I sign off.

---

## 1. Each round-1 finding and its fix

| Round 1 | Fix | Verified in | Resolved? |
|---|---|---|---|
| HR-01 (blocking) R-PRIV-1 Host header | Requests go through `raw()` to `http://127.0.0.1:{port}` with an explicit `Host: localhost:{port}` (`rawOnce` adds no second Host when one is supplied); forms equal to the `DATABASE_URL` host are excluded and annotated; if that would drop a canonical form the test skips as `inconclusive (gray-box)`. | `spawned.graybox.test.ts:110-144`, `lib/addr.ts:18-20` | Yes. No request header now carries the searched string; the exclusion cannot turn into a pass (see section 3). |
| HR-02 (blocking) status-region link count | `shortLinkIn()` selects the link whose accessible name starts with `PUBLIC_BASE_URL + "/"` (regex-escaped); `createdCode`, `a11y.spec.ts:24`, `network.spec.ts:14` use it; `createdCode` also checks the `href` prefix. | `fixtures.ts:97-115` | Yes. A second link in the region is ignored; the R-UI-3 test itself is unchanged and still checks name and href exactly. |
| HR-03 (blocking, moderate confidence) 200 KB probe | Coordinator reproduced 300/300 correct answers from a real axum server; probe dropped anyway. | `errors.test.ts:77-83` | Yes. I accept the downgrade to nit by my own rule; the 65,536/65,537 pair still proves R-ERR-2's size boundary. |
| HR-04 column order | Both sides sorted by `table.column` before `toEqual`. | `data.graybox.test.ts:70-86` | Yes. |
| HR-05 midnight gaps | `stats.test.ts`: a probe link supplies "today"; create, click and assertions all run inside `retryIfDayChanged`. `stats.graybox.test.ts` R-DATA-2 reporting wrapped in `anchoredToToday`. `stats-page.spec.ts` R-UI-7 (both) and R-UI-8 (two) wrapped in `retryIfDayChanged(() => apiToday(code), …)`. | diff lines 636-696, 862-964 | Yes. The retry now really starts from the start, and the UI comparisons re-synchronise page and API on a day change. |
| HR-06 proxy pause while piped | `unpipe()` both directions, then `pause()` both. | `lib/spawn.ts:104-112` | Yes. With no remaining pipe there is no `drain` handler left to resume the source. |
| HR-07 absolute positions / exact total | The two tests moved to `tests/invariants/list-total.test.ts` with their own `ensure21`; removed from `list.test.ts`. | diff lines 429-455, 697-747 | Yes. They now run only in the sequential suite, where exact `total` is sanctioned. |
| HR-08 string timestamps | `expectSameInstant` / `expectSameLink` (micros-based) in alias, list (×3), redirect, read-delete; `create.test.ts` and `home.spec.ts` parse dates; `formatCreated` renders from the parsed instant in UTC and still truncates seconds. | `lib/assert.ts:7-23`, diff | Yes. |
| HR-09 OPTIONS "everywhere" | SPEC v1.2: R-ERR-8 "on every matched route … An unmatched path is still 404 (R-ERR-6)"; R-REDIR-9 "on a matched `/{code}` path". | SPEC diff | Yes. |
| HR-10 HP-09 justification | SPEC v1.2: R-UI-4 scoped to the create form; delete-failure reporting unspecified; label reworded. COVERAGE note updated. | SPEC diff, COVERAGE | Yes. |
| HR-11 title overclaim | Renamed to "(/healthz 200 and a create succeed)". | `spawned.graybox.test.ts:61` | Yes. |
| HR-12 stale text | COVERAGE/NO_TEST say "JSON-equal"; package.json bumped. | diff | Yes (but see HR2-04: bumped to v1.2, SPEC is now v1.3). |
| HR-13 address family | DB-half searches `addr`, `127.0.0.1` and `::1` forms when `TARGET_API` is `localhost`. | `data.graybox.test.ts:133-137` | Yes. I checked that none of the extra forms (`::1`, `0:0:0:0:0:0:0:1`, `::ffff:7f00:1`, …) can occur in a `row_to_json` click row that has no referrer, so no false failure is introduced. |
| HR-14 networkidle | Replaced by visibility waits on the two controls. | `home.spec.ts:226-229` | Yes. |
| HR-15 `%2F` matching | SPEC v1.2 R-ROUTE-2 sentence plus two new tests. | SPEC diff, `routes.test.ts:182-209` | Yes (see HR2-01 on how it is characterised). |
| HR-16 zero-click entries | SPEC v1.2 R-STATS-5 "each with at least 1 click". | SPEC diff | Yes. |

## 2. The v1.2 and v1.3 SPEC changes

All six edits are confined to the rows they name, and I checked each against the rest of SPEC and `openapi.json`:

- **R-ERR-8 / R-REDIR-9 (v1.2):** now agree with R-ERR-6's ordering. No other rule mentions OPTIONS. Consistent.
- **R-ROUTE-2 `%2F` (v1.2):** "Routes are matched on the undecoded path, so `%2F` does not split a segment" plus the two examples. Consistent with R-ERR-5/R-REDIR-3 (decode once *before lookup*, i.e. after matching) and with the dot-segment rule, which explicitly inspects encoded forms. `openapi.json`'s `Code` pattern only bounds fuzzing. Unambiguous. This is the right choice (it is what raw-path routers do) and both tests match it exactly. **But it is a decision, not a restatement**: under v1.1 a router that decoded before matching was arguably compliant; under v1.2 it is not. See HR2-01.
- **R-STATS-5 (v1.2):** states what R-STATS-6 already said for devices. Consistent with the harness (`assert.ts:123`).
- **R-UI-4 (v1.2):** scoped to the create form; delete-failure reporting explicitly unspecified. Consistent with R-UI-6 (which only specifies the success path) and with every R-UI-4 test (all use the form). The unverifiable label is now honest.
- **R-PRIV-1 (v1.3, HP-21):** exclusion by `DATABASE_URL` host; inconclusive if that removes the client's canonical form; verification runs use a hostname. Consistent with the Configuration default (`localhost`) and with the verification-rules philosophy (never report a non-run as a pass). The term "canonical form" is not defined in SPEC (HR2-02), but the harness's definition is the obvious one.
- **R-UI-12 (v1.3, HP-22):** "This note states the scope of verification; it does not narrow the rule." Exactly the clarification round 1 asked for.

These do change text Matthew signed. Five of six are clarifications with no behavioural consequence for an implementation that followed the only consistent reading; the R-ROUTE-2 sentence is a new normative choice (sound, tested) and should be signed as such.

## 3. New logic introduced by the fixes

**R-PRIV-1 exclusion and inconclusive guard** (`lib/addr.ts`, `spawned.graybox.test.ts:124-144`). `canonicalForms(addr)` = the unmapped IPv4 form and the address as observed, deduplicated. `excluded` is the subset of `addressForms(addr)` equal (case-insensitively) to the `DATABASE_URL` hostname with brackets stripped. I traced the cases: db host `localhost` → nothing excluded, all four forms searched; `::ffff:127.0.0.1` → only that form excluded, plain `127.0.0.1` still searched; `127.0.0.1` with client `127.0.0.1` → canonical lost → `ctx.annotate` then `ctx.skip(note)`, so the test ends as skipped, never passed; `[::1]` db host with a `::1` client → same. The `excluded.includes(f)` comparison uses the same strings as `all`, so case handling is consistent. Because exclusion can only remove forms, and removing a canonical form forces a skip, there is no path to a pass that searches less than SPEC requires. No new false failure: every request now carries `Host: localhost:{port}`, `PUBLIC_BASE_URL` is `http://localhost:{port}`, and the only remaining way for `127.0.0.1` to appear in a post-request line is the api logging a peer address (the violation) or its own bind address per request (the residual SPEC already accepts under "where possible"). Annotations record the client address, the excluded forms and the searched forms. Honest.

**Two `%2F` tests** (`routes.test.ts:182-209`). `/a…%2Fb`: GET → `expectPlain404`, HEAD → 404 text/plain, PUT/DELETE → 405 text/plain with `Allow` = {GET, HEAD}. `/api/links/x…%2Fy`: PUT → 405 JSON with `Allow` = {GET, HEAD, DELETE}; POST `…/stats` → 405 with {GET, HEAD}; GET and GET stats → 404 `not_found`. Each assertion is a sentence of v1.2 R-ROUTE-2 + R-ERR-6 + R-ERR-5; nothing beyond SPEC is asserted. A plainly broken router (decode-then-route) fails the 405 cases; a router that redirects or normalises fails `expectPlain404`'s no-`Location` check.

**Moved list tests** (`tests/invariants/list-total.test.ts:33-61`). Same assertions as before, minus the retries they no longer need, plus `slice.total === full.total`, which is valid only because the invariants suite runs alone (`fileParallelism: false`, README scheduling rule). `vitest.invariants.config.ts` is unchanged and its `include` glob picks them up. Counts: invariants 6 → 8, list 9 → 7, matching SELF_CHECK run 6.

**Midnight retries.** `retryIfDayChanged` semantics are unchanged from round 1 (retry once, from the start, if the day read after the assertions differs). In `stats.test.ts` the create and click are now inside the closure, so attempt 2 clicks on the new day. In the UI tests the closure contains both the page load and the API read being compared, so a day change simply re-synchronises them; `linkWithClicks()` outside the closure is fine because its clicks are compared only page-vs-API, never against a date. Playwright's 60 s test timeout comfortably covers a second attempt.

**Reporting.** No `.only`, no retries, no unconditional skip; the three skip prefixes (`gray-box:`, `pending (gray-box):`, `inconclusive (gray-box):`) are distinct and documented in README and COVERAGE. COVERAGE's title count 179 = 177 + 2 new `%2F` tests (the two moved tests keep their titles). SELF_CHECK run 6 still shows 0 passes against both targets with per-file counts that match the sources (routes 71, list 7, invariants 8), and run 7 honestly says the inconclusive path was checked offline only.

## 4. Round-1 findings I now rate differently

- **HR-03:** nit, as the disposition says. The empirical check (300/300 through the harness's own `raw()` against axum with a `Content-Length`-based limit) answers the question I said would settle it. Dropping the probe anyway was the right call.
- Nothing else changes. HR-10's "delete race" argument is moot now that R-UI-4 is scoped.

---

## Findings

### HR2-01 — nit — SPEC Status line / `04-disposition.md` — characterisation of v1.2

The Status line says v1.2 is "four wording fixes that state what the harness already assumed, with no behavior change". Three of the four are that. The R-ROUTE-2 `%2F` sentence is a new normative decision: before it, `PUT /a%2Fb` → 404 from a decode-then-route implementation was a defensible reading; after it, that implementation fails two public tests (and presumably holdout variants). The decision is sound and I would have made it, but the sign-off record should say "three clarifications and one resolved ambiguity (R-ROUTE-2 `%2F`, now tested)". **Failure scenario:** none for a correct implementation; this is about what Matthew is told he is signing. **Fix:** one phrase in the Status line and in the v1.2 row of `04-disposition.md`.

### HR2-02 — nit — R-PRIV-1 (v1.3) — "canonical form" undefined in SPEC

SPEC says the search is inconclusive if exclusion removes "the client address's canonical form" but never says what that is; the harness defines it as the plain address as seen on the socket plus its unmapped IPv4 form (`lib/addr.ts:18-20`). **Fix:** add "(the plain address as the api sees it, e.g. `127.0.0.1`, and its unmapped IPv4 form)" to the R-PRIV-1 note, so the holdout and any future harness use the same definition.

### HR2-03 — nit — R-PRIV-1 — residual false-failure path accepted by SPEC v1.3

Exclusion is by the `DATABASE_URL` *hostname string*. A correct api that logs the *resolved* database address after the first request (for example `connected to 127.0.0.1:5432` when `DATABASE_URL` says `localhost`, emitted by a pool opening a connection lazily on the first create) would still fail. This matches SPEC v1.3 as written and is unusual (drivers log the configured host, not the resolved one), so it is a nit, not a blocker. **Fix:** either also exclude the resolved addresses of the database host (and report them), or list this in the verification report under "what this does not prove". Record in the README that the client address and the database host must differ *after resolution*.

### HR2-04 — nit — stale version strings

`README.md:3` says the suite targets "tag `spec-v1.2`" and `package.json:6` says "(spec-v1.2)", while SPEC is `spec-v1.3` and SELF_CHECK's run-7 note references v1.3. COVERAGE's R-UI-12 note still cites "SPEC v1.1" for the capture scope (true, the method is from v1.1, but the current text is v1.3). **Fix:** bump the two strings; optionally cite v1.3 in the R-UI-12 note.

### HR2-05 — nit (and the one thing I could not check) — the `inconclusive` skip reaching the report

The pending/inconclusive distinction depends on the skip note (`ctx.skip(note)`) and the `ctx.annotate` text being visible to the phase-6 report generator. Vitest's JSON reporter records `status: "skipped"`; whether it carries the note and annotations in the pinned Vitest 4.1.11 is something I cannot confirm from the workspace. If it does not, every gray-box skip would look the same in `results/api.json` and the generator could not tell "inconclusive" from "DATABASE_URL unset" (both are still never a pass, so this is honesty of *detail*, not of verdict). **Fix:** when the report generator is written, read the note from the test task (or from the annotation list) and fail the report build if a gray-box skip has no recognised prefix; a one-line dry run with `DATABASE_URL` set to a `127.0.0.1` URL would confirm the note is captured.

---

## What I checked / could not check

Checked: every hunk of the harness diff against the corresponding round-1 finding and against SPEC v1.3; the full current `addr.ts`, `assert.ts`, `spawn.ts`, `spawned.graybox.test.ts`; the exclusion logic by hand for `localhost`, `127.0.0.1`, `::ffff:127.0.0.1` and `[::1]` database hosts; the `%2F` tests against R-ROUTE-2/R-ERR-5/R-ERR-6/R-REDIR-9; that the moved tests are only reachable through the sequential config; that the extra address forms in the DB-half search cannot match a click row; the COVERAGE title count and SELF_CHECK per-file counts against the sources; that no `.only`, retry or unconditional skip was introduced.

Not checked (no execution, no web): Vitest's handling of a mid-test `ctx.skip(note)` and whether the note reaches the JSON report (HR2-05); the hidden holdout's version of the HR-02 selector fix, which the disposition says was applied; `unpipe()`/`pause()` behaviour on live sockets (HR-06), which follows from Node's documented `unpipe` semantics but was, as SELF_CHECK says, only type-checked. None of these can produce a false pass or a false failure in the public suite; they only affect report detail.
