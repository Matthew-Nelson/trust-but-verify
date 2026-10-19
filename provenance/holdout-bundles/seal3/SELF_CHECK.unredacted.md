# Self-check: the tests can fail

## Run 7 note (spec-v1.3, 2026-10-18)

One gray-box change: the spawned-instance R-PRIV-1 log test now skips at runtime as `inconclusive (gray-box): ...` (naming the client address, the excluded forms and the remedy) whenever excluding forms equal to the `DATABASE_URL` host would remove the client's canonical address form. Before this change, that case was a false pass. Both suites type-check. The exclusion logic was checked offline for three database hosts with a client at `127.0.0.1`:
- `localhost`: nothing excluded, all four forms searched.
- `::ffff:127.0.0.1`: that form excluded, `127.0.0.1` still searched.
- `127.0.0.1`: inconclusive skip.

With `DATABASE_URL`/`API_BIN` unset, the API suite still reports 17 gray-box tests skipped and 0 passed. No other test changed. Run-6 counts below stand.


## Run 6 update (review HR-01..16, spec-v1.2, 2026-10-18)

Changes: fixes for the independent review (HR-01..08, HR-11..14), two new tests for the spec-v1.2 undecoded-path rule (R-ROUTE-2, `%2F`), and two list tests moved into the sequential invariants suite (HR-07). Every suite was re-run. **No test passes against either target.**

| Suite | Target | Tests | Failed | Passed | Skipped (gray-box) | Failure causes |
|---|---|---|---|---|---|---|
| API | (a) nothing listening | 372 | 355 | **0** | 17 | 355 connection refused |
| API | (b) Prism, strict | 372 | 355 | **0** | 17 | 173 own assertion, 171 setup echo check, 11 R-ERR-1 envelope |
| API | (b) Prism, lenient | 372 | 355 | **0** | 17 | 305 own assertion, 29 R-ERR-1 envelope, 21 connection error (Prism crash/reset) |
| Invariants | (a) nothing | 8 | 8 | **0** | 0 | connection refused |
| Invariants | (b) Prism, strict | 8 | 8 | **0** | 0 | 4 own assertion, 4 setup echo check |
| Invariants | (b) Prism, lenient | 8 | 8 | **0** | 0 | 8 own assertion (including both moved list tests) |
| UI | (a) nothing | 35 | 33 | **0** | 2 | navigation/connection failure |
| UI | (b) `TARGET_WEB` = Prism (`--timeout 15000`) | 35 | 33 | **0** | 2 | no form/roles on Prism's responses |
| Holdout API | (a) / (b) strict / (b) lenient | 91 | 89 / 89 / 89 | **0 / 0 / 0** | 2 | connection; 44 own + 44 setup + 1 envelope; 87 own + 2 envelope |
| Holdout UI | (a) nothing / (b) Prism | 15 | 15 / 15 | **0 / 0** | 0 | |

Changed and new tests, individually:

- **New `%2F` tests** (`[R-ROUTE-2][R-REDIR-9][R-REDIR-3] /a%2Fb ...`, `[R-ROUTE-2][R-ERR-6][R-ERR-5] %2F inside /api/links/{code} ...`): fail with nothing listening. Against Prism, strict and lenient, the first fails on its own assertion and the second on the R-ERR-1 envelope.
- **HR-03** `[R-ERR-2] a 64 KiB body ...`: fails on its own assertion against Prism in both modes.
- **HR-05** `[R-STATS-2][R-STATS-3] a click now lands ...`: strict mode fails at setup; lenient fails on its own assertion.
- **HR-08 instant comparisons:** in lenient mode, R-ALIAS-3, R-LIST-1/R-GET-1, R-REDIR-4 and R-LINK-8 fail on their own assertions. R-GET-1 hit a Prism crash in the full run; run alone, all 6 read/delete tests failed on their own assertions (for example `expected 42 to be 0`).
- **HR-07 moved tests:** fail on their own assertions against Prism in lenient mode, and with connection refused when nothing is listening.
- **HR-02 / HR-05 / HR-14 UI changes:** fail with nothing listening and against Prism-as-web.
- **Not runnable here** (no database, no `API_BIN`): the HR-01 (R-PRIV-1 logs), HR-04 (R-DATA-3), HR-06 (proxy) and HR-13 (R-PRIV-1 database half) changes are gray-box. They type-check and skip cleanly. Their behavior against a real system is unverified until a run with `DATABASE_URL` and `API_BIN`.

Per file, run 6, API suite (failed / passed):

| File | Tests | Gray-box skipped | (a) nothing | (b) strict | (b) lenient |
|---|---|---|---|---|---|
| `tests/api/alias.test.ts` | 42 | 0 | 42 / 0 | 42 / 0 | 42 / 0 |
| `tests/api/click.test.ts` | 57 | 0 | 57 / 0 | 57 / 0 | 57 / 0 |
| `tests/api/create.test.ts` | 16 | 0 | 16 / 0 | 16 / 0 | 16 / 0 |
| `tests/api/data.graybox.test.ts` | 4 | 4 | 0 / 0 | 0 / 0 | 0 / 0 |
| `tests/api/errors.test.ts` | 83 | 0 | 83 / 0 | 83 / 0 | 83 / 0 |
| `tests/api/health.test.ts` | 1 | 0 | 1 / 0 | 1 / 0 | 1 / 0 |
| `tests/api/list.test.ts` | 7 | 1 | 6 / 0 | 6 / 0 | 6 / 0 |
| `tests/api/read-delete.test.ts` | 6 | 0 | 6 / 0 | 6 / 0 | 6 / 0 |
| `tests/api/redirect.test.ts` | 11 | 0 | 11 / 0 | 11 / 0 | 11 / 0 |
| `tests/api/routes.test.ts` | 71 | 0 | 71 / 0 | 71 / 0 | 71 / 0 |
| `tests/api/spawned.graybox.test.ts` | 5 | 5 | 0 / 0 | 0 / 0 | 0 / 0 |
| `tests/api/stats.graybox.test.ts` | 7 | 7 | 0 / 0 | 0 / 0 | 0 / 0 |
| `tests/api/stats.test.ts` | 14 | 0 | 14 / 0 | 14 / 0 | 14 / 0 |
| `tests/api/url.test.ts` | 48 | 0 | 48 / 0 | 48 / 0 | 48 / 0 |

The run-5 and run-1 records below are kept for history. Their counts refer to the suites as they were then.

---

## Run 5 update (spec-v1.1, 2026-10-18)

26 public API tests were added (HP-05 percent-decoded `/{code}`: 3; HP-06 encoded dot segments: 21; HP-07 leading U+000B: 2), and R-UI-12 was changed for HP-10. The whole API suite was re-run against both targets. **0 of 372 API tests pass against either target.**

| Target | API tests | Failed | Passed | Skipped (gray-box) | Failure causes |
|---|---|---|---|---|---|
| (a) nothing listening | 372 | 355 | **0** | 17 | 355 connection refused |
| (b) Prism, strict | 372 | 355 | **0** | 17 | 172 own assertion, 173 setup echo check, 10 R-ERR-1 envelope |
| (b) Prism, lenient | 372 | 355 | **0** | 17 | 304 own assertion, 28 R-ERR-1 envelope, 23 connection error (Prism crash/reset) |

How each of the 26 new tests fails:

- **(a) nothing listening:** connection refused, all 26.
- **(b) Prism, strict:** the 24 new redirect/route tests fail the setup echo check, because they need a real link. The 2 U+000B tests fail on their own assertions.
- **(b) Prism, lenient:**
  - 17 fail on their own assertions. Prism normalizes decoded dot segments, so `GET /api/x/%2e%2e/links/{code}`, `/api/%2E%2E/healthz` and `/api/links/{code}/%2e%2e/{code}` return 200, and `/x/%2E%2E/{code}` and `/%2e/{code}` return 302. Other failures: `/%2e` gets a 422, the 302 `Location` is not the created URL, and the stored URL is not the requested one.
  - 7 fail as R-ERR-1 envelope violations (Prism's `application/problem+json` 404/422).
  - 2 (the encoded-HEAD and encoded-unknown-code tests) hit a Prism crash. Re-run alone in lenient mode, all 3 `R-REDIR-3` tests failed on their own assertions.
- **R-UI-12 (changed):** fails with nothing listening and with `TARGET_WEB` pointed at Prism, where the form is missing. The rest of the UI suite: 33 failed, 0 passed, 2 skipped (gray-box) with nothing listening.

Per file, run 5 (failed / passed):

| File | Tests | Gray-box skipped | (a) nothing | (b) strict | (b) lenient |
|---|---|---|---|---|---|
| `tests/api/alias.test.ts` | 42 | 0 | 42 / 0 | 42 / 0 | 42 / 0 |
| `tests/api/click.test.ts` | 57 | 0 | 57 / 0 | 57 / 0 | 57 / 0 |
| `tests/api/create.test.ts` | 16 | 0 | 16 / 0 | 16 / 0 | 16 / 0 |
| `tests/api/data.graybox.test.ts` | 4 | 4 | 0 / 0 | 0 / 0 | 0 / 0 |
| `tests/api/errors.test.ts` | 83 | 0 | 83 / 0 | 83 / 0 | 83 / 0 |
| `tests/api/health.test.ts` | 1 | 0 | 1 / 0 | 1 / 0 | 1 / 0 |
| `tests/api/list.test.ts` | 9 | 1 | 8 / 0 | 8 / 0 | 8 / 0 |
| `tests/api/read-delete.test.ts` | 6 | 0 | 6 / 0 | 6 / 0 | 6 / 0 |
| `tests/api/redirect.test.ts` | 11 | 0 | 11 / 0 | 11 / 0 | 11 / 0 |
| `tests/api/routes.test.ts` | 69 | 0 | 69 / 0 | 69 / 0 | 69 / 0 |
| `tests/api/spawned.graybox.test.ts` | 5 | 5 | 0 / 0 | 0 / 0 | 0 / 0 |
| `tests/api/stats.graybox.test.ts` | 7 | 7 | 0 / 0 | 0 / 0 | 0 / 0 |
| `tests/api/stats.test.ts` | 14 | 0 | 14 / 0 | 14 / 0 | 14 / 0 |
| `tests/api/url.test.ts` | 48 | 0 | 48 / 0 | 48 / 0 | 48 / 0 |

Holdout, run 5: 90 Vitest tests (2 gray-box) + 15 Playwright, with 3 new tests and 1 changed. Results: (a) 88 failed / 0 passed; (b) strict 88 failed / 0 passed; (b) lenient 88 failed / 0 passed; UI with nothing listening 15 failed / 0 passed. Each new or changed holdout test fails against both targets.

Invariants (6 tests) were not changed, so the run-1 results below still apply.

The rest of this file is the original run-1 record against spec-v1. The tables below show the counts from that run.

---

No implementation exists, so every behavioral test should fail. Each suite was run against two targets:

- **(a) nothing listening** (`TARGET_API=http://127.0.0.1:59999`, `TARGET_WEB=http://127.0.0.1:59998`)
- **(b) a Prism mock of `spec/openapi.json`** (`@stoplight/prism-cli@5.16.0`, static examples, `pnpm mock` on `127.0.0.1:4010`)

Date: 2026-10-17. `DATABASE_URL` and `API_BIN` were unset throughout, so every gray-box test **skipped cleanly** with its message (`gray-box: DATABASE_URL is unset ...` / `API_BIN is unset ...`). Gray-box tests could not be exercised against either target, because no database exists. They have only been type-checked and checked to skip.

## How the Prism runs were made fair

- **Prism crashes** (`URIError: URI malformed`, uncaught) on malformed percent-escapes in paths (`/api/links/%zz`) and on some malformed JSON bodies. `scripts/mock.sh` restarts it in about 1 s, and the self-check sets `HARNESS_RETRY_REFUSED=1` so that requests sent while it restarts retry instead of failing on `ECONNREFUSED`. Requests that crash Prism, or that were in flight when it crashed, still end in `socket hang up`/`ECONNRESET`. These are counted as "connection error" below.
- **Strict mode** (the real configuration): `createOk()` checks that a created link echoes the requested `url` (WHATWG-serialized) and alias. Prism always returns the example link (`aZ3kQ9x`, `https://www.rust-lang.org/learn`), so many tests fail during setup.
- **Lenient mode** (`HARNESS_LENIENT_SETUP=1`, self-check only) turns that setup check off, so each test reaches its own assertions against canned data. This is the run that answers "does any test pass against canned examples?"

## Results

### API suite (`pnpm test:api`): 346 tests (329 black-box + 17 gray-box)

| Target | Failed | Passed | Skipped (gray-box) | Failure causes |
|---|---|---|---|---|
| (a) nothing listening | 329 | **0** | 17 | 329 connection refused |
| (b) Prism, strict | 329 | **0** | 17 | 170 own assertion, 149 setup echo check, 10 R-ERR-1 envelope (Prism's `application/problem+json`) |
| (b) Prism, lenient | 329 | **0** | 17 | 267 own assertion, 21 R-ERR-1 envelope, 41 connection error (Prism crash/reset) |

The 41 lenient-mode connection errors are collateral from Prism crashing: `R-CLICK-*`, a few `R-URL-*`/`R-ALIAS-2`/`R-STATS-5/6`/`R-LIST-2`, and the crash-inducing `R-ROUTE-2`/`R-ERR-2` inputs themselves. The non-crashing files (`click`, `stats`, `alias`, `url`, `list`) were re-run alone against Prism in lenient mode: **167 failed on their own assertions, 0 passed, 0 connection errors.**

Per file (failed / passed):

| File | Tests | Gray-box skipped | (a) nothing | (b) strict | (b) lenient |
|---|---|---|---|---|---|
| `tests/api/alias.test.ts` | 42 | 0 | 42 / 0 | 42 / 0 | 42 / 0 |
| `tests/api/click.test.ts` | 57 | 0 | 57 / 0 | 57 / 0 | 57 / 0 |
| `tests/api/create.test.ts` | 16 | 0 | 16 / 0 | 16 / 0 | 16 / 0 |
| `tests/api/data.graybox.test.ts` | 4 | 4 | 0 / 0 | 0 / 0 | 0 / 0 |
| `tests/api/errors.test.ts` | 83 | 0 | 83 / 0 | 83 / 0 | 83 / 0 |
| `tests/api/health.test.ts` | 1 | 0 | 1 / 0 | 1 / 0 | 1 / 0 |
| `tests/api/list.test.ts` | 9 | 1 | 8 / 0 | 8 / 0 | 8 / 0 |
| `tests/api/read-delete.test.ts` | 6 | 0 | 6 / 0 | 6 / 0 | 6 / 0 |
| `tests/api/redirect.test.ts` | 8 | 0 | 8 / 0 | 8 / 0 | 8 / 0 |
| `tests/api/routes.test.ts` | 48 | 0 | 48 / 0 | 48 / 0 | 48 / 0 |
| `tests/api/spawned.graybox.test.ts` | 5 | 5 | 0 / 0 | 0 / 0 | 0 / 0 |
| `tests/api/stats.graybox.test.ts` | 7 | 7 | 0 / 0 | 0 / 0 | 0 / 0 |
| `tests/api/stats.test.ts` | 14 | 0 | 14 / 0 | 14 / 0 | 14 / 0 |
| `tests/api/url.test.ts` | 46 | 0 | 46 / 0 | 46 / 0 | 46 / 0 |

### Invariants (`pnpm test:invariants`): 6 tests

| Target | Failed | Passed | Notes |
|---|---|---|---|
| (a) nothing | 6 | 0 | connection refused |
| (b) Prism, strict | 6 | 0 | R-ALIAS-5: 20×201 instead of one 201; R-LINK-6: 1 distinct code instead of 1,000; R-REDIR-5 and R-LIST-2 fail the setup echo check |
| (b) Prism, lenient | 6 | 0 | R-REDIR-5: `Location` is not the created URL; R-LIST-2: `total` did not grow by exactly 1 |

### UI (`pnpm test:ui`): 35 tests (33 + 2 gray-box)

| Target | Failed | Passed | Skipped |
|---|---|---|---|
| (a) nothing | 33 | 0 | 2 |

Prism doesn't apply here, because no web UI mock exists and the spec defines the UI only through R-UI. Every UI test begins with `page.goto` or an API setup call, so with nothing running all 33 non-gray-box tests fail.

### Holdout (`pnpm test:holdout`): 87 Vitest tests (2 gray-box) + 15 Playwright tests

| Target | Failed | Passed | Skipped |
|---|---|---|---|
| (a) nothing | 85 + 15 UI | 0 | 2 |
| (b) Prism, strict (API part) | 85 | 0 | 2 |
| (b) Prism, lenient (API part) | 85 | 0 | 2 |

### Fuzz (`pnpm fuzz`)

A smoke run against Prism (`FUZZ_MAX_EXAMPLES=5`) exited 1 with 10 failures (undocumented status codes, unsupported-method handling, schema-violating requests accepted) plus network errors from Prism crashing. This confirms the script, the check selection and the derived schema work. The real run needs a dedicated api instance (`FUZZ_API`).

## Tests that passed against the mock, and how they were fixed

Each one asserted only something a static example happens to satisfy. All were strengthened, and they now fail against Prism:

| Test | Why it passed | Fix |
|---|---|---|
| `[R-LINK-1] 25 generated codes ...` | Prism's example code `aZ3kQ9x` matches `^[A-Za-z0-9]{7}$` | Each code must also resolve, via GET, to the URL sent for it |
| `[R-HEALTH-1] ...` | `{"status":"ok"}` is the canned 200 | Now also requires `HEAD /healthz` to mirror GET's Content-Type with no body (R-ERR-8; the title names both IDs). The GET-only success branch is static by nature, and its behavioral half (actually checking the database) is covered by the gray-box R-HEALTH-1/3 tests |
| `[R-REDIR-2] ... no-store` | Prism sends the example `Cache-Control: no-store` | The redirect must be for the link just created (`Location` = its URL) |
| `[R-REDIR-9] DELETE /{code} -> 405 ...` | Prism answers unknown methods with 405, and GET returns the example | Requires `text/plain`, `Allow` = {GET, HEAD}, and the link still redirecting to its own URL |
| `[R-STATS-1][R-STATS-2] days=7 ...`, `days=%37 ...` | Prism's stats example has `days: 7` and 7 entries for code `aZ3kQ9x` | Uses a unique alias, and requires a new link's window to be all zero clicks |
| 11 `[R-ERR-3]` query tests (e.g. `limit=0`, `offset=-1`) | Prism validates query params against the schema and returns the canned 400 | Regrouped so that each test also includes "query integer" syntax cases no schema can express (`05`, `+5`, `%205`, `1e2`, ...), checked with soft assertions per value. The valid-echo cases now use non-default values (`offset=%31`, `limit=7`). The repeated-parameter test also requires the same values sent once to be echoed. Query-before-lookup now also requires a 404 for the same unknown code with a valid `days` |
| `[R-LIST-1] every link in a page is ... sorted` | One example item is trivially sorted | Requires at least 21 items (the file guarantees 21 of its own links) |
| invariants `[R-LIST-2] total equals ...` | Example `total: 1` with 1 item | `total` must grow by exactly 1 after this test's create, and the new link must be found |
| holdout `[R-LINK-3]`, `[R-URL-3][R-URL-1]`, `[R-ALIAS-2] near misses` | Status-only assertions | Now assert the echoed `url` / `code` |

## Reproduce

```sh
pnpm mock &                                                       # Prism on :4010 (restarting)
HARNESS_RETRY_REFUSED=1 TARGET_API=http://127.0.0.1:4010 pnpm test:api
HARNESS_RETRY_REFUSED=1 HARNESS_LENIENT_SETUP=1 TARGET_API=http://127.0.0.1:4010 pnpm test:api
node scripts/selfcheck-summary.mjs results/api.json               # counts + causes + any passing test
TARGET_API=http://127.0.0.1:59999 pnpm test:api                   # nothing listening
```
