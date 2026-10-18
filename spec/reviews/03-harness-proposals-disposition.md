# Disposition of harness proposals HP-01..19 (spec-v1 → spec-v1.1)

**Source:** `spec/PROPOSALS.md`, raised by the harness author (run 4) while writing tests against `spec-v1`.
**Decided by:** the coordinator, after Matthew approved amending the spec before any implementation exists (2026-10-18). Matthew reviews these resolutions at `harness-v1` sign-off; anything he overturns becomes `spec-v1.2`.
**Why now:** no implementation exists yet. Changing the spec or tests now can't have been influenced by code. The same change after implementation would mean the tests moved after the code existed.

Outcome: 18 accepted (5 of them with the coordinator choosing between options), 1 no change. Harness work needed: HP-05, HP-06, HP-07, HP-10 (new or changed tests); HP-09, HP-14, HP-15 (coverage labels only).

| ID | Area | Resolution | SPEC/OpenAPI change | Harness change |
|---|---|---|---|---|
| HP-01 | R-ERR-1 | Accepted as proposed. | Media type `application/json`; parameters allowed. | None (already compares media type only). |
| HP-02 | R-ERR-1 | Accepted as proposed. | No other keys at either level; `message` non-empty. | None (already asserted). |
| HP-03 | R-ERR-2 | Accepted as proposed. | 65,536 bytes accepted; 65,537+ malformed. | None (already asserted). |
| HP-04 | R-ERR-7 | Accepted. **Choice:** JSON-equal, matching the harness. Byte-equality adds nothing a client could observe. | "JSON-equal (not necessarily byte-equal)". | None. |
| HP-05 | R-REDIR-3 | Accepted. **Choice:** `/{code}` is percent-decoded once, like `/api/links/{code}`. One decoding rule for every code segment is simpler to state, implement and test than two. | R-REDIR-3 states it with the `GET /pct%2Dx` → `pct-x` example. | **New tests:** GET and HEAD on a percent-encoded code redirect to the right link (HEAD records no click); an encoded unknown code is a `text/plain` 404. Holdout variants with different encodings. |
| HP-06 | R-ROUTE-2 | Accepted. **Choice:** `%2e`/`%2E` counts as a dot, as in WHATWG. The observable difference is real: if `%2e%2e` were a code, `PUT /api/links/%2e%2e` would be 405, not 404, and a server that decodes then normalizes could route `/api/x/%2e%2e/links/{code}` to a real link. | R-ROUTE-2 defines a dot segment, with examples, and restates "404 regardless of method". | **New tests:** encoded and mixed dot segments are unmatched (404 regardless of method, never 302/200/405) under `/api/` and `/`. Holdout variants. |
| HP-07 | R-URL-1, R-URL-3, R-URL-5 | Accepted as proposed. | R-URL-1 says what the parser strips; new normative example row with a leading U+000B. | **New tests:** the U+000B example; a 2048-code-point input containing a leading U+000B is accepted and 2049 is rejected. Holdout variant with another C0 control. |
| HP-08 | R-UI-5 | Accepted. **Choice:** further columns may follow the four named ones; the row's controls may be in any cell. This is the harness's current behavior. | R-UI-5 reworded. | None. |
| HP-09 | R-UI-4, R-UI-5 | Accepted: labeled *(unverifiable)*. A dedicated empty instance was rejected as more machinery than the two clauses are worth. | Labels added. | COVERAGE.md labels. |
| HP-10 | R-UI-12 | Accepted. **Choice:** scoped to what a submit could cause and a test can attribute: no document navigation and no non-GET/HEAD request, from activating Shorten until 1 s after the alert. A server action or form post is a POST, so the realistic violations are still caught. A client-side GET caused by the submit is labeled unverifiable, because it can't be told apart from framework prefetches. | R-UI-12 reworded with the verification method. | **Changed test:** replace "zero requests of any kind" with the scoped capture (public and holdout). |
| HP-11 | Verification rules | Accepted as proposed (harness's current behavior). | Presence of own links; growth check retried up to 3 times; exact check only in invariants. | None. |
| HP-12 | Verification rules | Accepted as proposed. | Paging bounded by the largest `total` seen. | None. |
| HP-13 | Configuration | Accepted. `API_BIN` added, and `FUZZ_API` too (the harness already uses it and the spec didn't name it). | Configuration table, Verification rules, R-PRIV-1. | None. |
| HP-14 | R-HEALTH-2 | Accepted: labeled. Recovery is gray-box; "migrations run on an empty database once reachable" is **unverifiable** in v1. A scratch-database test was considered and deferred: it needs `CREATE DATABASE` rights and another variable. R-DATA-3 still checks the resulting schema. | Label added. | COVERAGE.md label. |
| HP-15 | R-HEALTH-3 | Accepted. Relabeled *(gray-box)* with the proxy method, and still paired with a mutant. | Label replaced. | COVERAGE.md label. |
| HP-16 | R-DATA-3 | Accepted. The harness pattern is restated as plain "name contains" terms, because SPEC regexes are whole-string matches. Views and materialized views are named as disallowed, which follows from "exactly the schema below". | R-DATA-3 reworded. | None (already enforced). |
| HP-17 | openapi.json | Accepted. Coordinator error in `spec-v1`. | `format: uri` removed from `Link.shortUrl` and the HEAD `/{code}` `Location`. Version 1.1.0. | None needed. `fuzz.mjs` may keep stripping `format: uri` from its derived copy (now a no-op for these fields). |
| HP-18 | openapi.json | Accepted, in the lighter form: 405 (with `Allow`) and unmatched-path 404 behavior is described in `info.description` rather than added to every operation. Schemathesis's unsupported-method check already exercises it, and the harness tests it directly under R-ERR-6. | `info.description`. | None. |
| HP-19 | prompt vs SPEC | No change. The prompt erratum already fixed N=20. | None. | None. |

## Counted by script

Accepted 18 (of which 5 involved a coordinator choice: HP-04, HP-05, HP-06, HP-08, HP-10), no change 1. Total 19.
