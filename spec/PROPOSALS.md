# Spec proposals

Any agent may append; only the coordinator edits `spec/`. Format: date · role · requirement ID (or "new") · problem · suggested change.

## From harness run 4 (2026-10-17), copied verbatim

**Disposed in `spec-v1.1` (2026-10-18):** see `spec/reviews/03-harness-proposals-disposition.md`.

These are problems found in `spec/SPEC.md` / `spec/openapi.json` (spec-v1) while writing the acceptance harness. `spec/` was not edited. For each one, the harness's current interpretation is stated so the suite's behavior is clear until a new tag decides it.

| ID | Problem | Suggested change | Harness interpretation today |
|---|---|---|---|
| HP-01 | **R-ERR-1** says `Content-Type: application/json`, but unlike R-REDIR-3 it doesn't say whether parameters (`; charset=utf-8`) are allowed. | Add: "media type `application/json`; parameters such as `charset` are allowed." | Compares the media type only and ignores parameters. |
| HP-02 | **R-ERR-1** requires `{"error":{"code","message"}}` but doesn't say whether `message` may be empty or whether extra keys are allowed. | Add: "`message` is a non-empty string; no other keys at either level." | Requires exactly these keys and a non-empty message. |
| HP-03 | **R-ERR-2** says "a body larger than 64 KiB" is malformed. Whether exactly 65,536 bytes is accepted is implied but easy to get wrong (`>=` vs `>`). | State it: "65,536 bytes is accepted; 65,537 bytes or more → 400." | 65,536 → 201 and 65,537 → 400 are both asserted. |
| HP-04 | **R-ERR-7** says every 500 body is "exactly" the canonical JSON. It isn't clear whether that means byte-exact or JSON-equal. | Say which. | JSON-equal. A 500 is only checked when one is observed (no way to force one). |
| HP-05 | **R-ERR-5** percent-decodes path segments "on `/api/links/{code}*`". **R-REDIR-3** refers to "R-ERR-5 semantics" for `/{code}`, so it's ambiguous whether `GET /pct%2Dx` redirects for the code `pct-x`. | State whether `/{code}` segments are percent-decoded once before lookup. | Decoding is tested only under `/api/links/`. `/{code}` decoding is not tested. |
| HP-06 | **R-ROUTE-2** says paths with "dot segments" are unmatched, but not whether percent-encoded dot segments (`%2e`, `%2E%2E`) count as dot segments. | Clarify (WHATWG treats `%2e` as `.`). | Only literal `.`/`..` segments are tested. |
| HP-07 | **R-URL-1 / R-URL-3**: only ASCII whitespace is trimmed, but the WHATWG parser itself strips leading/trailing C0 controls (U+0000–U+001F, e.g. U+000B). An input like `"\u000Bhttps://example.com"` is therefore valid, and the U+000B counts toward the 2,048-code-point limit. Implementers may not expect this. | Add a normative example row for a leading U+000B (valid, counted in the length). | Not tested. |
| HP-08 | **R-UI-5** lists the column headers Short link, Destination, Clicks, Created, but also requires a "Stats for {code}" link and a "Delete {code}" button in each row. It doesn't say whether a fifth "Actions" column (with or without a header) is allowed. | State whether extra columns are allowed and where the controls live. | The first four headers must be exactly these, in order. Extra trailing columns are tolerated. Cells 1–4 are matched exactly (the Short link cell only by its link). |
| HP-09 | **R-UI-5** "with no links it has no body rows" and **R-UI-4** "anything else → Something went wrong" can't be verified on a shared, non-empty database through the UI (no UI input produces another error code), but neither is labeled. | Label both *(unverifiable)*, or define a dedicated empty instance / a way to provoke a non-listed error. | Not tested. Listed in COVERAGE.md. |
| HP-10 | **R-UI-12**: "the browser sends no network request" applies literally to any request, including framework background traffic (route prefetch, HMR, analytics) that has nothing to do with the submit. | Scope it to "no request caused by submitting the form", or to fetch/XHR/form/document requests. | Waits for `networkidle`, then requires **zero** requests of any kind for 1 s after clicking Shorten. |
| HP-11 | **Verification rules / Shared database**: "assert that `total` has grown by at least the number of links created" can fail correctly-behaving systems when other parallel tests delete their own links between the two reads. | Allow retrying, or assert on the presence of the test's own links instead. | Retries the growth check up to 3 times. The exact full-table `total` check runs only in the sequential invariants suite. |
| HP-12 | **Verification rules / Scheduling**: paging "bounded by `total` at the first call" can miss a test's own links if concurrent inserts push them past that bound. | Bound by the largest `total` seen. | Uses the largest `total` seen. |
| HP-13 | **R-HEALTH-1 (503 branch), R-HEALTH-2, R-PRIV-1 (logs)** need the harness to start its own api instance and read its stdout/stderr, but "Configuration" defines no way to do that (no binary path or start command). | Add a harness variable, e.g. `API_BIN` (command that starts the api, honoring `DATABASE_URL`, `PORT`, `PUBLIC_BASE_URL`, `COUNTRY_HEADER`). | Uses `API_BIN`. Without it these tests skip. R-PRIV-1's log search therefore covers a harness-spawned instance, not the externally started one. |
| HP-14 | **R-HEALTH-2** "applies migrations once the database is reachable" can't be shown against the shared database, which is already migrated. | Provide a scratch, empty database URL for this check, or label the migration clause. | Checks recovery (`/healthz` 200 and a working create) after the database becomes reachable through a harness proxy, against the shared database. |
| HP-15 | **R-HEALTH-3** is labeled *(mutant-verified)*, but it can be shown gray-box with a TCP proxy (forward → black-hole → the next `/healthz` must be 503). | Relabel as *(gray-box)* with that method. | Implemented as a gray-box test (needs `API_BIN` + `DATABASE_URL`). |
| HP-16 | **R-DATA-3** allows "a migration-bookkeeping table" without naming it. | List accepted names or patterns (e.g. `_sqlx_migrations`, `refinery_schema_history`, `__diesel_schema_migrations`, `seaql_migrations`). | Allows at most one extra table whose name matches `migrat\|schema_(history\|version)\|flyway\|refinery\|diesel\|sqlx\|seaql`. No views or materialized views. |
| HP-17 | **openapi.json** puts `format: "uri"` on `Link.shortUrl` and on the HEAD `/{code}` `Location` header (the GET one has none). SPEC says WHATWG serializations aren't always RFC 3986 and that format validation is off for URL-valued fields. | Remove `format: "uri"` from those two places. | `pnpm fuzz` strips `format: "uri"` from a derived copy and keeps date/date-time format checks. |
| HP-18 | **openapi.json** documents no `405` responses and no `404` for unmatched `/api/...` paths, though R-ERR-6 makes both normative. Schemathesis conformance checks therefore rely on SPEC text for them. | Document 405 (with `Allow`) on each operation, or note it in the description. | No change. The harness tests these directly (R-ERR-6). |
| HP-19 | The harness brief asked for R-ALIAS-5 with 50 concurrent requests, but SPEC says N=20 (the coordinator confirmed SPEC wins). | No spec change. Noted for the record. | N=20, run 3 times. |

## From harness run 5 (2026-10-18), copied verbatim

| ID | Problem | Suggested change | Harness interpretation today |
|---|---|---|---|
| HP-20 | **Configuration / `API_BIN`**: "Tests that need it are reported as pending when it is unset." Vitest has no separate "pending" status for a test skipped at runtime, so its JSON report shows them as `skipped`, the same as tests skipped for a missing `DATABASE_URL`. | Allow "skipped, with a note saying pending", or have the verification report map these tests to "pending" by note text. | Tests that need `API_BIN` skip with a note that starts `pending (gray-box): API_BIN is unset ...`, so a report can tell them apart from `DATABASE_URL` skips (`gray-box: DATABASE_URL is unset ...`). |

**Coordinator disposition (2026-10-18): no spec change.** "Reported as pending" is a rule for the verification report, not for the test runner. The report generator (phase 6) will show every skipped gray-box test as *pending*, never as passed, and will use the note prefix to say which variable was missing.

## From harness run 6 (2026-10-18), copied verbatim

| ID | Problem | Suggested change | Harness interpretation today |
|---|---|---|---|
| HP-21 | **R-PRIV-1** (log search) doesn't say what to do when the client address coincides with the `DATABASE_URL` host (for example both are `127.0.0.1`). A correct api may log its database host on reconnect, which the search would read as a logged client IP. | Add: "forms equal to the `DATABASE_URL` host are excluded from the search and reported." | Excludes forms equal to the `DATABASE_URL` host and annotates which were excluded (HR-01). Requests carry `Host: localhost:{port}`. |
| HP-22 | **R-UI-12**: the normative sentence says "no network request", while the verification note limits the check to navigations and non-GET/HEAD requests. A reader can't tell whether the note narrows the rule or only its verification (review, "five coordinator choices"). | State that the parenthetical is the scope of verification, not a narrowing of the rule. | Verifies only the scoped capture. The client-side GET part is reported unverified (COVERAGE.md). |

**Disposed in `spec-v1.3`:** see `spec/reviews/04-disposition.md` (HP-21 accepted with an inconclusive guard, implemented in harness run 7; HP-22 accepted, wording only).

## From the web implementer (run 9, 2026-10-18), confirmed by the coordinator

| ID | Problem | Suggested change | Harness interpretation today |
|---|---|---|---|
| HP-23 | **Harness false failure, R-UI-1** (`harness/tests/ui/home.spec.ts`, the `[R-UI-1] form has ...` test). It checks `required === false` on **every** control in `form.elements`. `HTMLButtonElement` (and `fieldset`, `output`, `object`) has no `required` property, so a form whose Shorten control is a `<button>` reads `undefined` and fails. SPEC only forbids `required` on the form's controls; a `<button>` can't carry it. | No SPEC change. Harness: assert `required !== true` (or check only `input`, `select` and `textarea`). The holdout's R-UI-1 variant checks only the two textboxes and is not affected (checked by the coordinator; the seal is unchanged). | `harness-v1` stays frozen. The web implementation uses `<input type="submit" value="Shorten">`, which has role button, name "Shorten" and `required === false`. That is SPEC-conformant, not a workaround that weakens anything. Fix at the next harness revision. |

## From the api implementer (run 8, 2026-10-18), copied verbatim except for the IDs

The agent numbered these HP-23 and HP-24 on branch `impl-api`, in parallel with the web implementer's HP-23 above. They are renumbered HP-24 and HP-25 here; the branch copy is replaced at merge.

Both items concern `pnpm fuzz` (R-OAS-1) against the Rust api. The api was not changed to work around them.

| ID | Problem | Suggested change | Behavior I implemented |
|---|---|---|---|
| HP-24 | **R-OAS-1 / R-ERR-3**: Schemathesis's `negative_data_rejection` check sends an undefined query parameter (`GET|HEAD /api/links?offset=0&x-schemathesis-unknown-property=42`) and expects a 4xx. R-ERR-3 says "Parameters an endpoint doesn't define are ignored", so 200 is the specified answer. The run fails with 2 failures for any api that follows R-ERR-3. | Exclude `negative_data_rejection` from the fuzz run (or only for additional-properties-in-query cases), and say so in "Verification rules / Fuzzing". | Unknown query parameters are ignored (200), per R-ERR-3. |
| HP-25 | **R-OAS-1 / Fuzzing**: `scripts/fuzz.mjs` passes `--max-redirects 0`. Schemathesis 4.29.1 then reports every 302 as `Network Error: Exceeded 0 redirects.`, so `GET /{code}` and `HEAD /{code}` always error once a code exists, even though the 302 is exactly what R-REDIR-1 requires. 2 errors on a correct api. | Allow the 302 in the fuzz run (for example, a Schemathesis hook or check that treats a 302 without following it as a response), or drop `--max-redirects 0`. | `GET|HEAD /{code}` return 302 with `Location` and `Cache-Control: no-store`, per R-REDIR-1/2. |

**Disposed in `spec-v1.4`:** see `spec/reviews/06-disposition.md` (HP-24 and HP-25 accepted as SPEC contradictions; HP-23 is a harness-only fix).

## From harness run 10 (2026-10-18), copied verbatim

HP-23 (R-UI-1 `required` on buttons), HP-24 (no undefined parameters in fuzz generation) and HP-25 (3xx recorded, not followed) are implemented in harness run 10.

| ID | Problem | Suggested change | Harness interpretation today |
|---|---|---|---|
| HP-26 | **Verification rules / Fuzzing**: "It does not follow redirects" doesn't say whether Schemathesis's own start-up probes count. They don't go through the hooks, and they ignore `--max-redirects`, so in 4.29.1 a probe answered with a 3xx was observed following it to the `Location` host. A conforming api answers the probe path (`/schemathesis-probe%5C%1B%01`) with a 404, so this matters only for safety ("never reach an external host"), not for conformance. | Add: "This includes any requests the tool sends on its own, such as capability probes." | `fuzz/no_redirects.py` disables redirect-following process-wide (`requests.Session.resolve_redirects` is replaced), so probes also record the 3xx without following it. Verified with a local sink: 0 follow-up requests (SELF_CHECK.md, run 10). |
