# Disposition of review #1 (`01-opus-adversarial.md`)

Every finding is accounted for. **Accepted** means the proposed wording was adopted in substance. **Modified** means the problem was fixed in a different way, with the reason given. **Decision** means it was a product choice, made by Matthew on 2026-10-17. No finding was rejected.

| Finding | Disposition | Where it landed |
|---|---|---|
| F-01 Seeded-row encoding | Accepted | R-DATA-2; R-CLICK preamble ("stored values; normalize on write") |
| F-02 Counters/caches hide seeded rows | Accepted | R-DATA-1, R-DATA-3, Data model note on `id` and `created_at` |
| F-03 openapi vs SPEC (`alias` pattern, `additionalProperties`, 400 vs 422) | Accepted | openapi: removed `pattern` and `additionalProperties`; R-LINK-8 (ignore unknown fields); R-ERR-2 ("content checks are never 400"); "SPEC wins" stated in both files |
| F-04 `maxLength` before trimming | Accepted | openapi: removed `maxLength`; R-URL-3 |
| F-05 Schemathesis not pinned, shared DB | Modified | "Verification rules → Fuzzing": all checks, positive + negative modes, fixed seed recorded, ≥100 examples, no redirect following, dedicated DB. The version is pinned in the harness lockfile rather than in the spec, so the spec doesn't name a tool version. 500 documented on every operation; 405 rule in R-ERR-6/R-REDIR-9. |
| F-06 Parser-dependent normalization | Accepted | "Shared definitions → URL parsing" (WHATWG); R-URL-2, R-URL-5 with normative examples |
| F-07 Health 503 untestable | Accepted | R-HEALTH-1 (per-request, 2 s timeout, 3 s response; 503 branch gray-box via second instance) |
| F-08 Dotted reserved names unreachable | Modified | Dotted names removed from the R-ALIAS-2 list and mentioned in a note, rather than kept as unreachable entries |
| F-09 Host vs host:port | Accepted | R-URL-4 (hostname, port ignored, no DNS/IP equivalence) |
| F-10 404 vs 400 precedence | Accepted | R-ERR-5 (query validation before lookup) |
| F-11 Impossible codes, percent-decoding | Accepted | R-ERR-5, R-REDIR-3; openapi: removed `pattern` on the `Code` parameter |
| F-12 Clamp vs 400 | Accepted | R-ERR-3 ("nothing is clamped"), R-LIST-1/2 (`offset ≥ total` → empty `items`) |
| F-13 Integer syntax | Accepted | "Shared definitions → Query integer" |
| F-14 Sort tie-break | Accepted | R-LIST-1 (`createdAt` desc, id desc) |
| F-15 Shared database | Accepted | "Verification rules → Shared database"; Fuzzing on a dedicated DB |
| F-16 Midnight / clock skew | Accepted | "Shared definitions → Clock" (database clock); "Verification rules → Time" |
| F-17 "Through now" vs calendar day | Accepted | R-STATS-3 (half-open window to the start of tomorrow) |
| F-18 2 s window and "exactly one" | Accepted | R-REDIR-4; "Verification rules → Eventual visibility" |
| F-19 R-REDIR-5 under-specified | Accepted | R-REDIR-5 (≥100 in flight, all 302, read at ≥2 s and 4 s) |
| F-20 R-ALIAS-5 N and shape | Accepted | R-ALIAS-5 (N=20, distinct URLs, winner's URL stored) |
| F-21 Referrer normalization | Accepted | R-CLICK-1 with examples |
| F-22 Country whitespace, repeats, non-ISO | Accepted | R-CLICK-2; openapi `topCountries` description |
| F-23 Empty User-Agent | Accepted | R-CLICK-3 |
| F-24 Which whitespace | Accepted | "Shared definitions → ASCII whitespace"; R-URL-1 |
| F-25 Unit of length | Accepted | R-URL-3 (code points, before parsing) |
| F-26 Alias trimming | Accepted | R-LINK-3 |
| F-27 "Malformed body" boundaries | Accepted | R-ERR-2 (full list; 64 KiB cap → 400; `Content-Type` ignored) |
| F-28 Errors that avoid JSON | Accepted | R-ERR-1, R-ERR-6; new enum value `method_not_allowed` |
| F-29 HEAD / other methods | Decision + accepted | R-REDIR-7 (HEAD: same response, no click; Matthew's choice); R-REDIR-9 (405); openapi `head` operation |
| F-30 Trailing slash, query string | Decision + accepted | R-ROUTE-1; R-REDIR-8 (query ignored; Matthew's choice) |
| F-31 What counts as "no scheme" | Accepted | R-UI-2 |
| F-32 Native constraint validation | Accepted | R-UI-1 (`novalidate`), R-UI-12 |
| F-33 Table contents and refresh | Accepted | R-UI-5 |
| F-34 Confirm button placement | Accepted | R-UI-6 |
| F-35 UI formats and empty tables | Accepted | R-UI-7 |
| F-36 Default and odd `days` | Accepted | R-UI-8 |
| F-37 Collation | Accepted | "Shared definitions → Name order" |
| F-38 R-ERR-4 untestable | Accepted | R-ERR-4 (patterns); R-ERR-7 (exact 500 body, mutant-verified) |
| F-39 R-PRIV-1 scope | Decision | R-PRIV-1 covers database **and** logs (Matthew's choice); log search is gray-box |
| F-40 Missing gray-box labels | Accepted | Labels on R-STATS-2/3; *(probabilistic)* label on R-ALIAS-5 and R-REDIR-5; label legend at top |
| F-41 Generated vs reserved/existing | Accepted | R-LINK-7 |
| F-42 `PUBLIC_BASE_URL` trailing slash | Accepted | R-LINK-4; Configuration |
| F-43 CORS untested | Decision | CORS removed entirely (Matthew's choice); Configuration note; out of scope |
| F-44 Non-default config | Accepted | "Verification rules → Configuration" (defaults only, except the health 503 phase) |
| F-45 `Cache-Control` exact value | Accepted | R-REDIR-2 (directive present) |
| F-46 404 media type and body | Accepted | R-REDIR-3 |
| F-47 Timestamp format | Accepted | "Shared definitions → Timestamps"; R-GET-1 (full precision) |
| F-48 axe version, pages, states | Modified | R-UI-10 lists pages and states; version pinned in the harness lockfile rather than the spec (same reasoning as F-05) |
| F-49 En dash, match mode | Modified | Message rewritten as "3 to 32" to remove the en-dash trap; matching is exact after trimming (UI preamble) |
| F-50 Copy button behavior | Accepted | R-UI-3 (writes to clipboard) |
| F-51 Unverified "browser never calls /api" | Accepted | R-UI-11 (network capture) |
| F-52 Stats echo fields | Accepted | R-STATS-1; openapi descriptions |
| F-53 `totalClicks` vs `clickCount` | Accepted | R-STATS-4 |
| F-54 Days before creation | Accepted | R-STATS-2 |
| F-55 Zero-click entries, special names | Accepted | R-STATS-5, R-STATS-6 |
| F-56 Version and "every route" | Accepted | openapi `info.version` 1.0.0; R-DEL-1 lists routes |

## Totals
Accepted 48 · Modified 4 · Decision (alone or with accepted wording) 4 · Rejected 0 · Total 56 (counted by script, not by hand).
