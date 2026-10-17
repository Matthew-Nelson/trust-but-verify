# Self-check: the tests can fail

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
| 3 holdout tests *(titles redacted by the coordinator until the holdout is revealed; the unredacted file is in the sealed bundle, see `provenance/HOLDOUT_SEAL.md`)* | Status-only assertions | Strengthened |

## Reproduce

```sh
pnpm mock &                                                       # Prism on :4010 (restarting)
HARNESS_RETRY_REFUSED=1 TARGET_API=http://127.0.0.1:4010 pnpm test:api
HARNESS_RETRY_REFUSED=1 HARNESS_LENIENT_SETUP=1 TARGET_API=http://127.0.0.1:4010 pnpm test:api
node scripts/selfcheck-summary.mjs results/api.json               # counts + causes + any passing test
TARGET_API=http://127.0.0.1:59999 pnpm test:api                   # nothing listening
```
