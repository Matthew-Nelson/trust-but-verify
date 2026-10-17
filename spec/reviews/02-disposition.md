# Disposition of review #2 (`02-fable-adversarial.md`)

Every finding is accounted for. The **Origin** column records whether the problem sits in wording that **revision 1 introduced** (`50fa7c2`, written to answer review #1) or in wording that was **already present** in the draft (`60960c0`) and that review #1 missed. That column is evidence about the method: making rules more precise creates new edges, so a single review round isn't enough.

| Finding | Origin | Disposition | Where it landed |
|---|---|---|---|
| R2-01 `positive_data_acceptance` fails by construction | rev-1 | Modified | Fuzzing rule excludes that one check by name instead of listing every allowed check, since check names vary by Schemathesis version. openapi `offset` gets a `maximum` |
| R2-02 api can't boot without DB, so 503 is untestable | rev-1 | Accepted | New R-HEALTH-2; api prompt updated |
| R2-03 "sends no request to the api" is unobservable | rev-1 | Accepted (browser-observable option) | R-UI-12 (client-side check, network capture) |
| R2-04 R-ERR-4 vs examples that echo input | rev-1 × draft examples | Accepted (option a) | R-ERR-4 ("never include request-supplied values"); openapi examples rewritten |
| R2-05 HEAD on `/api/*` and `/healthz` | rev-1 | Accepted | New R-ERR-8; openapi `head` operations on every GET route |
| R2-06 Method vs lookup precedence | rev-1 | Accepted | R-ERR-6 (four-step check order with examples) |
| R2-07 `/api/` JSON vs text | rev-1 | Accepted | R-ERR-1 (`/api/<non-empty remainder>`), R-REDIR-3 |
| R2-08 Query parameters validated globally? | rev-1 | Accepted | R-ERR-3 (scoped per endpoint) |
| R2-09 Server-layer answers for `%ZZ`, `/../`, long URIs | rev-1 | Accepted | New R-ROUTE-2; openapi `Code` gets `maxLength` and `pattern` (bounding fuzzing only, as the parameter description says) |
| R2-10 `$` and trailing newline | draft | Accepted | "Shared definitions → Regular expressions" (`\A…\z`) |
| R2-11 Timestamp string vs instant | rev-1 | Accepted | "Verification rules → Timestamps" (compare as instants) |
| R2-12 "Same headers" can't be literal | rev-1 | Accepted | R-REDIR-7 (named headers only) |
| R2-13 Log search matches bind address | rev-1 | Accepted | R-PRIV-1 (lines after the first request, address forms, recorded) |
| R2-14 Bulk create pushes rows off page | rev-1 | Accepted | "Verification rules → Scheduling" |
| R2-15 UI alias trimming | rev-1 | **Decision (coordinator, flagged for Matthew)** | R-UI-2: the UI trims the alias and omits it if empty; the api stays strict |
| R2-16 Empty "Your links" table | draft | Accepted | R-UI-5 (table always present) |
| R2-17 Echo raw or decoded code | rev-1 | Accepted | R-STATS-1 (stored code) |
| R2-18 Host `direct` vs `NULL` | rev-1 | Accepted | R-CLICK-1 (a host equal to `direct` is stored as `NULL`) |
| R2-19 Collision clause unforceable | rev-1 | Modified | R-LINK-7 collision clause labeled *(unverifiable)* rather than adding a test backdoor; new label added to the legend |
| R2-20 Health caching undetected | rev-1 | Accepted | R-HEALTH-1 (black-hole listener); new R-HEALTH-3 *(mutant-verified)* |
| R2-21 What counts as invalid `days` in the UI | rev-1 | Accepted | R-UI-8 |
| R2-22 Truncate vs round minutes | rev-1 | Accepted | R-UI-5 (seconds truncated) |
| R2-23 Example that can't be observed | rev-1 | Accepted | R-UI-2 example → `example.com:8443/x` |
| R2-24 Fuzz instance vs "defaults only" | rev-1 | Accepted | "Verification rules → Configuration" |
| R2-25 Midnight in seeded tests | rev-1 | Accepted | "Verification rules → Time" (retry any date-anchored test) |
| R2-26 `Allow` as an exact string | rev-1 | Accepted | R-ERR-6, R-REDIR-9 (compare sets) |
| R2-27 Repeated `Referer`, encoding | draft | Accepted | R-CLICK-1 |
| R2-28 Reserved paths the api might serve | draft | Accepted | New R-ROUTE-3 |
| R2-29 Duplicate JSON keys, bad UTF-8 | draft | Accepted | R-ERR-2 |
| R2-30 `format: uri` vs WHATWG output | draft | Accepted | openapi: `format` dropped on `Link.url` and `Location`; fuzzing format validation off for URL fields |
| R2-31 Percent-decoding query values | rev-1 | Accepted | "Shared definitions → Query integer" |
| R2-32 Clipboard only in Chromium | rev-1 | Accepted | R-UI-3 label |

## Totals
Accepted 29 (2 of them by choosing one of the reviewer's options) · Modified 2 · Decision 1 · Rejected 0 · Total 32.
Origin: introduced by revision 1: 26 (one of them interacts with draft examples) · present in the draft and missed by review #1: 6.
Counts produced by script; origins spot-checked by grepping the draft commit `60960c0` for the cited wording.
