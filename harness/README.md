# Shortlink acceptance harness

An independent acceptance suite for `../spec/SPEC.md` and `../spec/openapi.json` (tag `spec-v1`). It tests the spec, not an implementation. Every test title starts with the requirement ID(s) it checks, for example `[R-STATS-2][gray-box] ...`. `COVERAGE.md` maps every SPEC ID to its tests, and `SELF_CHECK.md` shows that the tests fail when nothing correct is running.

## Setup

```sh
pnpm install            # exact versions pinned in package.json + pnpm-lock.yaml
pnpm setup:ui           # downloads Chromium into node_modules (PLAYWRIGHT_BROWSERS_PATH=0)
```

You need Node 22 or later and pnpm. `pnpm fuzz` also needs `uv`/`uvx`; Schemathesis is pinned to `schemathesis==4.29.1` in `scripts/fuzz.mjs`.

## Scripts

| Script | What it runs |
|---|---|
| `pnpm test:api` | Vitest API acceptance suite (`tests/api/`): HTTP over `fetch` with `redirect: "manual"`, plus raw `node:http`/TCP where fetch can't send the request (duplicate headers, non-UTF-8 header bytes, no User-Agent, unnormalized paths, HEAD body checks). Covers R-LINK, R-URL, R-ALIAS, R-ERR, R-LIST, R-GET, R-DEL, R-REDIR, R-ROUTE, R-CLICK, R-STATS and R-HEALTH. Files run in parallel, and every test creates its own links. Gray-box tests (`*.graybox.test.ts`, plus one in `list.test.ts`) skip with a message when `DATABASE_URL` / `API_BIN` are unset. |
| `pnpm test:invariants` | `tests/invariants/`: R-ALIAS-5 (20 concurrent creates of one alias, run 3 times), R-REDIR-5 (500 redirects with at least 100 in flight, then exact counts at 2 s and 4 s), R-LINK-6/7 (1,000 sequential creates), and an R-LIST-2 full-table `total` check. Files run one at a time. |
| `pnpm test:ui` | Playwright + `@axe-core/playwright` against `TARGET_WEB` (`tests/ui/`), covering R-UI-1 to R-UI-12. Elements are selected only by role and accessible name from the R-UI table. Every UI test captures network traffic and fails if the browser requests an `/api/` path (R-UI-11). Test data is created through the api from Node. Runs serially. |
| `pnpm fuzz` | R-OAS-1. Schemathesis against `spec/openapi.json` with every check except `positive_data_acceptance`, positive and negative modes, a fixed seed (`FUZZ_SEED`, default `20261017`), 100 examples per operation, and no redirect following. Format validation is turned off only for URL-valued fields: `format: "uri"` is stripped from a derived copy of the schema in `fuzz/out/openapi.fuzz.json`, while date/date-time formats are still checked. Reports and `summary.txt` (seed, version, command) go to `fuzz/out/`. |
| `pnpm test:holdout` | Runs the hidden holdout suite at `../holdout`, or at `HOLDOUT_DIR` if set. It is distributed separately and reuses `lib/` and `node_modules/` from here. Set `HOLDOUT_SKIP_UI=1` to skip its browser part. |
| `pnpm coverage:manifest` | Regenerates `COVERAGE.md` from SPEC IDs and test titles, and fails if any ID is unaccounted for. |
| `pnpm mock` | A Prism mock of the spec on `127.0.0.1:4010`, restarted when it crashes. Only used for the self-check. |
| `pnpm typecheck` | `tsc --noEmit`. |

**Scheduling (SPEC "Verification rules").** Never run `test:ui`, `test:invariants` or `test:holdout` at the same time as each other or as `test:api`, because the list-order and bulk tests need the link table to themselves. Run them one after another, for example `pnpm test:api && pnpm test:invariants && pnpm test:ui && pnpm test:holdout`. Run `pnpm fuzz` against a **dedicated** api instance and database.

## Environment variables

| Var | Default | Used for |
|---|---|---|
| `TARGET_API` | `http://localhost:8080` | api under test |
| `TARGET_WEB` | `http://localhost:3000` | web UI under test |
| `PUBLIC_BASE_URL` | `http://localhost:8080` | what the api was started with (R-LINK-4 `shortUrl`, R-URL-4 own-host check) |
| `COUNTRY_HEADER` | `cf-ipcountry` | what the api was started with (R-CLICK-2) |
| `DATABASE_URL` | unset | gray-box: seeding backdated clicks, reading stored encodings and schema. **Leave it unset and gray-box tests skip.** Never point it at a database you care about: tests insert rows. |
| `API_BIN` | unset | gray-box: path or command for the api executable. The harness then starts its own instances on free ports, with `DATABASE_URL` pointed at a harness-owned TCP listener, for R-HEALTH-1 (the 503 branch), R-HEALTH-2 and R-HEALTH-3, and captures stdout/stderr for R-PRIV-1. |
| `FUZZ_API` | falls back to `TARGET_API`, with a warning | dedicated api instance for `pnpm fuzz` |
| `FUZZ_SEED`, `FUZZ_MAX_EXAMPLES` | `20261017`, `100` | fuzz run parameters |
| `HOLDOUT_DIR`, `HOLDOUT_SKIP_UI` | `../holdout`, unset | holdout runner |
| `HARNESS_RETRY_REFUSED`, `HARNESS_LENIENT_SETUP` | unset | **self-check only.** These retry refused connections for a restarting mock, and skip the setup check that a created link echoes its request. Never set them for a real run. |

## How the tests stay deterministic on a shared, live system

- The database is never assumed empty or truncated. Aliases and URLs carry random suffixes. List tests assert the relative order of their own links (paging with `limit=100` until all are found) and that `total` grew by at least the number created.
- "Today" comes from the server: `daily[last].date` or the database's `now()`, never the runner's clock. Date-anchored tests re-read today afterwards and retry once if it changed, so a run that crosses midnight UTC still passes. Seeded timestamps are absolute (`D 00:00:00Z`, `D-1 23:59:59.999999Z`).
- Click visibility (R-REDIR-4) is polled with a 2.5 s deadline measured from when the redirect's headers arrived, then re-read at 4 s or later.
- Timestamps are compared as instants with microsecond precision (`micros()` in `lib/links.ts`), never as strings.
- Every request sets `User-Agent` explicitly.
- Every 4xx/5xx from `/healthz` or `/api/<…>` is checked on the spot against the R-ERR-1 envelope, the R-ERR-4 message patterns and the R-ERR-7 500 body (`lib/http.ts`). A violation fails the test that received the response.

## Layout

```
lib/         config, HTTP clients (fetch / raw node:http / raw TCP), domain helpers, assertions, gray-box DB, spawned instances
tests/api/   API acceptance (Vitest)
tests/invariants/  concurrency and bulk invariants (Vitest, sequential)
tests/ui/    Playwright UI + axe
scripts/     fuzz.mjs, run-holdout.mjs, coverage.mjs, mock.sh, selfcheck-summary.mjs
```
