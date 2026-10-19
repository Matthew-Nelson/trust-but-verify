# Mutants against `impl-v1`

Each patch is relative to the repo root, applies with `git apply --check`, builds (`SQLX_OFFLINE=true cargo build --release` for the api, `pnpm build && pnpm typecheck` for the web) and starts. Patches that change a SQL literal also add the matching `.sqlx/query-*.json` offline-cache entry, exactly as `cargo sqlx prepare` would. Every patch begins with a header comment giving the requirement ID, a description, why it is realistic and how to trigger it.

"Catch" is my guess at how likely a harness that tests the SPEC line by line is to kill the mutant: **easy** = a direct test of the rule's own example kills it; **medium** = needs the rule's stated edge case or a gray-box step; **hard** = needs a combination, a non-ASCII/IP/precision input, or a timing the SPEC does not spell out.

| File | Requirement | Category | Description | Catch |
|---|---|---|---|---|
| `01-url-length-bytes.patch` | R-URL-3 | boundary / off-by-one | URL limit counted in UTF-8 bytes, not code points; 2048-code-point non-ASCII URL rejected | hard |
| `02-alias-max-length-exclusive.patch` | R-ALIAS-1 | boundary / off-by-one | `3..32` instead of `3..=32`; a 32-character alias gets 422 | medium |
| `03-body-limit-off-by-one.patch` | R-ERR-2 | boundary / off-by-one | body of exactly 65,536 bytes rejected with 400 | medium |
| `04-query-integer-lenient-parse.patch` | R-ERR-3 | parsing / normalization | plain `parse::<i64>()`: `limit=05`, `limit=+5`, `days=007` accepted instead of 400 | medium |
| `05-stats-window-start-exclusive.patch` | R-STATS-3 | time / window edges | daily buckets use `>` at the window start; a click at exactly 00:00:00Z of the first day is dropped | medium |
| `06-devices-window-extra-day.patch` | R-STATS-6 | time / calendar math | `devices` window starts one day early (days+1 days); other fields keep the right window | hard |
| `07-device-mobi-substring.patch` | R-CLICK-3 | parsing / normalization | mobile rule matches `mobile`, not `mobi`; "Opera Mobi" becomes desktop | hard |
| `08-referrer-ip-host-direct.patch` | R-CLICK-1 | parsing / normalization | referrer host via `Url::domain()`; IP-literal referrers recorded as `direct` | hard |
| `09-country-duplicate-header-first-wins.patch` | R-CLICK-2 | parsing / normalization | duplicated country header uses the first value instead of `unknown` | medium |
| `10-url-unicode-trim.patch` | R-URL-1 | parsing / normalization | `str::trim()` strips NBSP/VT etc.; `" https://…"` gets 201 instead of 422 | hard |
| `11-self-host-check-includes-port.patch` | R-URL-4 | validation / precedence | self-reference check compares authority (host:port); `http://localhost:9999/x` accepted | medium |
| `12-url-validated-before-alias-type.patch` | R-ERR-2 | validation order | URL validated before the alias type check; `{"url":"nope","alias":5}` → 422 not 400 | hard |
| `13-stats-lookup-before-query-validation.patch` | R-ERR-6 | validation order | stats looks the code up before validating `days`; unknown code + bad days → 404 not 400 | medium |
| `14-trailing-slash-tolerated.patch` | R-ROUTE-1 | validation / routing | one trailing slash stripped; `/api/links/` and `/{code}/` match | medium |
| `15-stats-route-no-percent-decode.patch` | R-ERR-5 | parsing / routing | stats route skips percent-decoding; `/api/links/pct%2Dx/stats` → 404 | medium |
| `16-dot-segment-uppercase-escape.patch` | R-ROUTE-2 | parsing / routing | only lowercase `%2e` counts as a dot; `PUT /%2E` → 405 instead of 404 | hard |
| `17-blank-alias-treated-as-none.patch` | R-LINK-3 | validation / precedence | whitespace-only alias treated as absent; `"   "` yields a generated code instead of 422 | medium |
| `18-alias-check-then-upsert.patch` | R-ALIAS-5 | concurrency / race | SELECT-then-`ON CONFLICT DO UPDATE`; concurrent same-alias creates can all get 201, last url wins | medium (probabilistic) |
| `19-click-writer-backpressure-drops.patch` | R-REDIR-5 | concurrency / race | 4-permit `try_acquire` around the click insert drops clicks under load; single clicks fine | medium (probabilistic) |
| `20-health-cached-3s.patch` | R-HEALTH-3 | side effects / caching | healthy `/healthz` result reused for 3 s without querying the database | medium |
| `21-head-redirect-missing-cache-control.patch` | R-REDIR-7 | HTTP headers | `Cache-Control: no-store` only on GET; HEAD 302 lacks it | medium |
| `22-allow-missing-head-on-link.patch` | R-ERR-8 | HTTP headers | 405 on `/api/links/{code}` advertises `Allow: GET, DELETE` (no HEAD) | medium |
| `23-healthz-405-text-plain.patch` | R-ERR-1 | status / error media type | unsupported method on `/healthz` returns the text/plain 405, not JSON | medium |
| `24-internal-error-message-detail.patch` | R-ERR-7 | error body / leaking internals | 500 `message` carries the internal error detail | easy (once a 500 is triggered: dead database → `GET /api/links`) |
| `25-alias-taken-echoes-alias.patch` | R-ERR-4 | error body / leaking | 409 message names the requested alias | medium |
| `26-click-insert-failure-breaks-redirect.patch` | R-REDIR-6 | side effects | click insert awaited with `?`; a failed insert turns the redirect into a 500 | medium (gray-box trigger: `CHECK (false) NOT VALID` on `clicks`) |
| `27-click-insert-retry-delays-redirect.patch` | R-REDIR-6 | side effects | inline insert with 3 retries and 1 s sleeps; a failing insert delays the 302 by ~3 s | medium (same trigger) |
| `28-direct-stored-literally.patch` | R-DATA-2 | side effects / data contract | `referrer_host` stores `'direct'` instead of NULL; API output identical | medium (gray-box only) |
| `29-last-clicked-at-millis.patch` | R-GET-1 | precision / side effects | timestamps formatted to milliseconds; `lastClickedAt` loses stored microseconds | hard |
| `30-top-countries-limit-10.patch` | R-STATS-5 | sorting / limits | `topCountries` returns up to 10 entries | medium |
| `31-list-tiebreak-id-asc.patch` | R-LIST-1 | sorting / tie-breaking | list tie-break `id ASC` for equal `createdAt` | hard |
| `32-ui-multiple-confirm-open.patch` | R-UI-6 | UI: confirmation flow | per-row confirm state; several "Confirm delete" buttons can be open at once | medium |
| `33-ui-scheme-regex-lowercase-http-only.patch` | R-UI-2 | UI: normalization | scheme test is `^https?://`; `HTTP://x.com` gets prefixed to `https://HTTP://x.com` | medium |
| `34-ui-days-number-parse.patch` | R-UI-8 | UI: parsing / query integer | `days` parsed with `Number()`; `007`, `+7`, `7.0`, `1e1` honored instead of 30 | hard |
| `35-ui-whitespace-destination-hits-server.patch` | R-UI-12 | UI: client-side check | only `""` is caught client-side; whitespace-only destination triggers the action POST | medium |
| `36-ui-created-rounds-minute.patch` | R-UI-5 | UI: calendar math | Created column rounds to the nearest minute instead of truncating seconds | hard |
| `37-ui-click-counts-thousands-separators.patch` | R-UI-7 | UI: accessible text | "Total clicks: 1,234" with separators once a link has 1,000+ clicks | hard |

## Coverage by category

| Category | Mutants |
|---|---|
| boundary conditions / off-by-one | 01, 02, 03 (also 05, 30) |
| time zones, calendar math, window edges | 05, 06, 36 (also 29) |
| parsing / normalization of headers and URLs | 04, 07, 08, 09, 10, 15, 16, 33, 34 |
| validation order and precedence | 11, 12, 13, 14, 17 |
| concurrency and race conditions | 18, 19 (20 is the related cached-state case) |
| sorting, tie-breaking and limits | 30, 31 |
| missing or wrong HTTP headers and status codes | 21, 22, 23 |
| error-body shape and leaking internals | 24, 25 |
| side effects (recorded too often / rarely / not at all) | 19, 20, 26, 27, 28, 29 |
| UI: accessible names, roles, confirmation flow, client checks | 32, 33, 34, 35, 36, 37 |

## Required pairings

| Requirement | Mutant(s) |
|---|---|
| R-ERR-7 (mutant-verified) | 24 |
| R-REDIR-6 (mutant-verified, at least 2) | 26 (insert failure → 500), 27 (insert failure → ~3 s delay) |
| R-HEALTH-3 (cached health result) | 20 |
| R-ALIAS-5 (lost uniqueness under concurrency) | 18 |
| R-REDIR-5 (lost concurrent clicks) | 19 |

## Coverage by requirement area

| Area | Mutants |
|---|---|
| R-LINK | 17 |
| R-URL | 01, 10, 11 |
| R-ALIAS | 02, 18 |
| R-ERR | 03, 04, 12, 13, 15, 22, 23, 24, 25 |
| R-LIST / R-GET | 31, 29 |
| R-REDIR / R-ROUTE | 14, 16, 19, 21, 26, 27 |
| R-CLICK / R-DATA | 07, 08, 09, 28 |
| R-STATS | 05, 06, 30 |
| R-HEALTH | 20 |
| R-UI | 32, 33, 34, 35, 36, 37 |

## Triggering the gray-box ones

- **26 / 27** (R-REDIR-6): on a harness-owned database (never the shared one), block inserts without affecting reads: `ALTER TABLE clicks ADD CONSTRAINT no_clicks CHECK (false) NOT VALID;` (or `REVOKE INSERT ON clicks FROM <api role>`). `GET /{code}` must still be a prompt 302. Drop the constraint afterwards. Mutant 26 answers 500; mutant 27 answers 302 after about 3 s.
- **24** (R-ERR-7): any 500. The simplest is the R-HEALTH-1 instance whose `DATABASE_URL` points at the accept-and-never-respond listener (or a closed port): `GET /api/links` returns 500 after the pool's 5 s acquire timeout, with the pool error in `message`.
- **20** (R-HEALTH-3): the proxy test as written, provided the second `/healthz` is sent within 3 s of the 200.
- **18 / 19**: the R-ALIAS-5 and R-REDIR-5 load tests as written.
- **05, 06, 29, 31, 36, 37**: seeded rows with the timestamps named in each patch header.
