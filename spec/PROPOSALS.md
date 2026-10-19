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

## From gap round 1 (run 12, 2026-10-18), copied verbatim

From the harness author, against `spec/SPEC.md` tag `spec-v1.4`. Each entry gives the exact SPEC text proposed and lists the tests that depend on it. Those tests are in `harness/tests/api/faults.graybox.test.ts`. Until SPEC adopts the proposals a test needs, it skips with a note beginning `pending (gray-box, proposed HP-..)`, and the rule it covers is reported **unverified**. An operator enables the tests for a run with `HARNESS_PROPOSALS=HP-27,HP-28,HP-29`, which should happen only after adoption.

## Why these are needed

Red-team runs found three behaviors that no suite caught. In each one, the api answered 500 with a non-canonical body (R-ERR-7), or it changed or delayed the redirect when a click failed to record (R-REDIR-6). No test ever made the api hit an internal error or fail to record a click, so nothing could notice.

The question was whether the spec-v1.4 gray-box contract lets the harness cause those conditions deliberately and safely. **It does not.** These are the options the contract allows, and why each falls short:

- **Seeding rows (Data model).** The harness may insert `links` rows with an explicit `created_at` and `clicks` rows. No insert it is allowed to make causes a later click write to fail. Out-of-domain rows (an unencodable `url`, an extreme `created_at`) might make an api fail, but that is implementation-dependent, so it is not deliberate. It is also unsafe, because a poisoned `links` row would break every parallel test's `GET /api/links` page that contains it.
- **Row locks on the test's own link.** Holding `SELECT ... FOR UPDATE` on the test's `links` row blocks the api's click insert, because the FK check takes `FOR KEY SHARE`. That is a delay, not a failure. Turning the wait into a failure means deleting or re-keying the row (`UPDATE links SET id = DEFAULT`), which the Data model does not grant. Deletion also makes the expected response ambiguous: once the link is gone, a 404 is defensible.
- **The R-HEALTH-3 style TCP proxy on a spawned instance** (refuse or black-hole). It cannot separate the click write from the link lookup, so it cannot produce "click failed, lookup fine". The R-ERR-7 condition it produces (database unreachable) is one where SPEC leaves the api's behavior "unspecified beyond R-ERR-1" (R-HEALTH-2). In any case, the Configuration rule lists API_BIN uses, and R-ERR-7 and R-REDIR-6 are not on that list.

The approach below confines the fault to one harness-spawned api process and its own database sessions. The rest of the shared database keeps working normally. The only change in it is the test's own links and click rows, created through the api as in every other test. The effect ends when the test stops the process. The tests do this in `afterEach`, which also runs on failure and timeout.

---

## HP-27: API_BIN instances may be used for R-ERR-7 and R-REDIR-6

**Affects:** Verification rules, "Configuration"; the labels on R-ERR-7 and R-REDIR-6.

**Problem.** The Configuration rule lists the API_BIN uses: "R-HEALTH-1 503 branch, R-HEALTH-2, R-HEALTH-3, R-PRIV-1 logs". A fault test for R-ERR-7 or R-REDIR-6 cannot run against the shared target api without disturbing parallel tests, so it needs an instance of its own.

**Proposed text.**
- Verification rules, "Configuration": replace "(R-HEALTH-1 503 branch, R-HEALTH-2, R-HEALTH-3, R-PRIV-1 logs)" with "(R-HEALTH-1 503 branch, R-HEALTH-2, R-HEALTH-3, R-PRIV-1 logs, and the fault-injection tests for R-ERR-7 and R-REDIR-6)".
- R-ERR-7 and R-REDIR-6: replace the label "*(mutant-verified)*" with "*(mutant-verified; also gray-box: see "Fault injection" in Verification rules)*".

**Tests that depend on it:** both tests in `faults.graybox.test.ts`.

## HP-28: Fault injection through a harness PostgreSQL protocol proxy

**Affects:** a new bullet in "Verification rules".

**Problem.** SPEC describes no way to make the database reject the api's statements. The fault has to break the click write while the link lookup keeps working (R-REDIR-6), and it has to produce a genuine internal error (R-ERR-7). It must also leave the shared database and every other client alone.

**Proposed text** (new bullet after "Configuration"):

> - **Fault injection (R-ERR-7, R-REDIR-6).** The harness starts an api instance with `API_BIN`. Its `DATABASE_URL` is the verification database's URL with the host and port replaced by those of a harness-owned PostgreSQL wire-protocol proxy that forwards to that database. The proxy relays every message unchanged, with two exceptions. (a) It declines SSL and GSS encryption requests itself, so the instance's database connections are unencrypted. (b) While a session is idle between transactions (its last ReadyForQuery reported `I`, and no request is outstanding or partly sent), the proxy may run `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` and `SET search_path TO ''` on that session and discard the responses. This applies to every current and future session of that instance. No other client uses the instance, and the harness stops it when the test ends. While its sessions are read-only, a click row the api cannot write is "a failure to record a click" (R-REDIR-6), and a request the api cannot complete because the database rejected a statement is an internal error (R-ERR-7). Verification runs use a database that accepts unencrypted connections from the harness host. An instance must accept an unencrypted connection when its `DATABASE_URL` does not require encryption. If the api restores a read-write default or a search path on its own sessions after connecting, the affected test is reported inconclusive, never passed.

**What the harness does with it.** `harness/lib/pgproxy.ts` implements exactly (a) and (b). The R-REDIR-6 test applies `READ ONLY` only. The R-ERR-7 test applies `READ ONLY`, then adds the empty `search_path`, so that reads which use unqualified table names fail too. Each test records the proxy's evidence (sessions reached, statements applied, errors) and skips as `inconclusive (gray-box)` instead of passing if the fault could not be shown to have taken effect.

**Tests that depend on it:** both tests in `faults.graybox.test.ts`.

## HP-29: A measurable definition of "normal latency" in R-REDIR-6

**Affects:** R-REDIR-6.

**Problem.** "Never ... delays it beyond normal latency" has no number. A harness has to choose a bound, and implementers should know what it is.

**Proposed text** (append to R-REDIR-6):

> *Normal latency* is measured on the same instance, for the same link, from the same client, in the same test. B is the slowest of (i) at least 10 `GET /{code}` redirects sent while clicks are recorded successfully and (ii) at least 10 `HEAD /{code}` requests, which record nothing (R-REDIR-7), interleaved with the `GET`s whose click fails. Each `GET` whose click fails must receive its response headers within max(4 × B, B + 1 s). Its status, `Location` and `Cache-Control` must equal those of the normal redirects for that link, and so must its `Content-Type` and body, unless those already differ between normal redirects.

**Justification.** An api that records synchronously and gives up on the first error spends one extra failed statement: well under a millisecond to a few milliseconds locally. An api that records asynchronously spends nothing. The HEAD requests are sent at the same moment and under the same load, minus the recording, so B tracks the conditions under which the faulted GETs ran. The ×4 and +1 s margins absorb scheduler and GC pauses from the parallel suite. Any retry loop, backoff or timeout wait measured in seconds still exceeds the bound whenever B is under about 1 s. B and the bound are recorded as test annotations.

**Tests that depend on it:** `[R-REDIR-6][gray-box] ...` in `faults.graybox.test.ts`.

## HP-30 (optional, changes api behavior): which status a database error gets

**Affects:** R-ERR-7.

**Problem.** R-ERR-7 constrains the body of every 500, but nothing requires a 500 when the database rejects a statement. An api may answer such a failure with `503 unavailable`, or with another status, and still conform. The R-ERR-7 test then sees no 500, so it can only report `inconclusive (gray-box)`.

**Proposed text** (append to R-ERR-7): "When a request under `/api/` cannot complete because the database rejected a statement (not because it was unreachable or timed out), the response is this 500."

**Note.** This adds a rule for implementations, so adopt it only if R-ERR-7 must be verifiable on every implementation. The R-ERR-7 test does not need it in order to run. Without it, the test is inconclusive on an api that never answers 500.

**Tests that depend on it:** none (it would only remove the inconclusive outcome of `[R-ERR-7][gray-box] ...`).

**Disposed in `spec-v1.5`:** see `spec/reviews/08-disposition.md` (HP-27, HP-28, HP-29 adopted verbatim; HP-30 declined).
