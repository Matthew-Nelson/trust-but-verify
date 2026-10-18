BLOCK

# Harness review: `harness-v1` (commit `f6d203e`) against `spec-v1.1`

Reviewer: independent, static review only (nothing was run). Scope: `spec/SPEC.md`, `spec/openapi.json`, `spec/reviews/03-harness-proposals-disposition.md`, `spec/PROPOSALS.md`, and every file under `harness/` except `node_modules` and the lockfile.

**Summary.** The harness is careful, honest, and close to SPEC. The spec-v1.1 changes (HP-05, HP-06, HP-07, HP-10) are implemented exactly as worded. Gray-box tests skip with a note, nothing is `.only`, nothing retries, and the self-check counts match the code. I found **three tests that a SPEC-correct implementation could fail**, each with a one-line fix (HR-01..03), plus thirteen nits. Fix the three and this is a sign-off; none of them changes the shape of the suite.

---

## Findings

### HR-01 — blocking — R-PRIV-1 — `tests/api/spawned.graybox.test.ts:106-123` (`[R-PRIV-1][gray-box] api stdout/stderr after the first request never contain the client address`)

**What's wrong.** The harness connects to the spawned api at `http://127.0.0.1:{port}` (line 111) and searches every later log line for `127.0.0.1` and its IPv6-mapped forms. But every request the harness sends also carries `Host: 127.0.0.1:{port}` (fetch derives it from the URL). The string being searched for is therefore present in the harness's own request, not only in the client's address. SPEC says the harness "where possible" uses an address different from the bind address and the database host; here the harness manufactures a third coincidence itself.

**Failure scenario.** A correct api logs one structured line per request following the OpenTelemetry HTTP semantic conventions, e.g. `method=POST route=/api/links server.address=127.0.0.1 server.port=54321 status=201` (`server.address` is the `Host` header value), or logs `url.full=http://127.0.0.1:54321/api/links`. No client IP is logged anywhere, so R-PRIV-1 holds. The test reads `127.0.0.1` in the line and fails. The same happens if the operator's `DATABASE_URL` uses `127.0.0.1` and the api logs a reconnect message with the database host after the first request (pools open connections lazily).

**Fix.** Send the requests with `raw()` and an explicit `Host: localhost:{port}` header (rawOnce already honours a supplied `Host`), or connect over `::1` when the api accepts it; exclude from `forms` any form equal to the database host in `DATABASE_URL`; annotate which address was excluded. Keep the search otherwise as is.

### HR-02 — blocking — R-UI-2, R-UI-3, R-UI-10, R-UI-11 — `tests/ui/fixtures.ts:97-102` (`createdCode`), `tests/ui/a11y.spec.ts:24`, `tests/ui/network.spec.ts:14`

**What's wrong.** `createdCode()` and the two spec files locate the success link with `statusRegion(page).getByRole('link')` and require `toHaveCount(1)`: the status region must contain exactly one link of any kind. R-UI-3 says the status element "contains a link whose name and href are the new shortUrl, and a button named Copy short link". It does not say the link is the only one. The one test that is written for R-UI-3 itself (`home.spec.ts:89`) correctly selects by name; the helper used by eight other tests does not.

**Failure scenario.** A correct UI renders the success message as `<div role="status"><a href="http://localhost:8080/abc">http://localhost:8080/abc</a> <button>Copy short link</button> <a href="/links/abc">View stats</a></div>`. The R-UI-3 test passes. `createdCode()` sees two links and throws, failing all six `[R-UI-2] destination: …` tests, `[R-UI-2] the alias field is trimmed…`, `[R-UI-10] / after a success`, and the R-UI-11 journey test.

**Fix.** Select the short link by what SPEC specifies: `statusRegion(page).getByRole('link', { name: new RegExp('^' + escapeRegExp(PUBLIC_BASE_URL) + '/') })` (or filter by `href` prefix), in `createdCode`, `a11y.spec.ts:24` and `network.spec.ts:14`.

### HR-03 — blocking (moderate confidence; see note) — R-ERR-2 — `tests/api/errors.test.ts:83` (`[R-ERR-2] a 64 KiB body (65536 bytes) is accepted; 65537 bytes -> 400 bad_request`)

**What's wrong.** The third probe posts a 200,000-byte body. SPEC only needs 65,537 to show the rule. A server that applies a 64 KiB body limit stops reading at the limit, writes the 400 and closes the connection, as hyper-based servers (axum, the likely Rust stack) do when a response is sent before the request body is consumed. A `close()` with unread bytes in the receive queue sends a TCP RST; depending on buffer sizes and scheduling, Node sees `ECONNRESET`/`EPIPE`/"socket hang up" before it has parsed the 400. The 65,537-byte probe is safe (the server reads it all before deciding); the 200,000-byte one is a race.

**Failure scenario.** A correct axum api with `DefaultBodyLimit::max(65536)` mapped to 400 `bad_request`. The 65,536 and 65,537 probes pass; the 200,000 probe intermittently throws a connection error from `raw()`, failing the test (and SELF_CHECK would count it as "connection error", not as a 400).

**Fix.** Drop the 200,000-byte probe, or cap it at ~90 KB and accept the response only; alternatively treat a reset *after* the 65,537 probe has passed as inconclusive and retry once. Note: I could not run this; a two-minute check against any throwaway axum server with a body limit settles it. If it does not reproduce, downgrade to a nit.

### HR-04 — nit — R-DATA-3 — `tests/api/data.graybox.test.ts:56-76`

The column comparison is `toEqual` on rows ordered by `ordinal_position`, so an implementation that declares the same columns in a different order (e.g. `device` before `clicked_at`) fails. SPEC says "exactly the schema below", which can be read as including order, but column order is unobservable and no other rule depends on it. Suggest sorting both sides by `(table, column)` before comparing.

### HR-05 — nit — R-STATS-2/3, R-DATA-2, R-UI-7 — midnight anchoring gaps

- `tests/api/stats.test.ts:48-65`: the retry re-reads "today" but does not redo the click. If midnight UTC falls between the redirect and the assertions, the `days=1` check fails on both attempts (the click is now yesterday). SPEC says retry "from the start"; wrap the create+click inside `retryIfDayChanged`.
- `tests/api/stats.graybox.test.ts:157-171`: seeds at `D T01:00:00Z` from one `dbNow()` and asserts `days=1`, without `anchoredToToday`.
- `tests/ui/stats-page.spec.ts:47-51, 71-89, 100-110`: page render and the API read it is compared with can straddle midnight (`daily` dates shift). No retry.
All are ~1e-5 per run; listed for completeness.

### HR-06 — nit — R-HEALTH-3 — `lib/spawn.ts:100-114`

Blackhole mode is implemented by `pause()` on sockets that are still `pipe()`d. Node's pipe machinery calls `src.resume()` on a `drain` event of the destination, so a large write in flight at the moment of the flip could silently re-enable forwarding and the "very next /healthz must be 503" assertion would see a 200. Unlikely at health-check sizes; `unpipe()` both directions (or destroy and re-accept in blackhole mode) is airtight.

### HR-07 — nit — Verification rules — `tests/api/list.test.ts:67-93`

`offset skips exactly…` and `offset >= total…` compare absolute list positions and an exact `total` across two reads, retried 5 times. The rules sanction only the own-links/relative-order style, up to 3 retries for the growth check, and exact `total` only in the invariants suite. The retries make a false failure negligible (~1e-5), so this is a letter-of-the-rules deviation, not a flake. Either move the two checks into the invariants suite or add them to the rule.

### HR-08 — nit — Verification rules ("Timestamps are compared as instants") — `tests/api/read-delete.test.ts:13`, `tests/api/alias.test.ts:109`, `tests/api/redirect.test.ts:38`, `tests/api/list.test.ts:103-104`

Four places compare timestamp strings from two reads with `toBe`/`toEqual`. Both values come from the same api and stored row, so a deterministic serializer always passes; a serializer that varies fractional digits between reads would not. Use `micros()` as elsewhere.

### HR-09 — nit — SPEC wording (R-ERR-8, R-REDIR-9 vs R-ERR-6)

R-ERR-8 says "OPTIONS is unsupported everywhere → 405" and R-REDIR-9 "any method other than GET or HEAD on /{code} → 405", while R-ERR-6 makes route matching step (1) and an unmatched path "404 regardless of method". The harness follows R-ERR-6 (`routes.test.ts:152`: `OPTIONS /api/%2e%2e/healthz` → 404), which is the only consistent reading, but an implementer who installs a global OPTIONS → 405 handler ahead of routing will fail it. Add "on every matched route" to R-ERR-8 and R-REDIR-9.

### HR-10 — nit — HP-09 label justification (R-UI-4)

The label says "no UI input produces another error code". That is not strictly true: create a link, load `/`, delete it through the api, then click `Delete {code}` and `Confirm delete`; the UI's DELETE gets 404 `not_found`, which is "anything else". Whether R-UI-4 applies to the delete path is itself unclear (its table lists only create errors). The *unverifiable* label is acceptable only if R-UI-4 is understood as the create form; say so in R-UI-4, or test the "anything else" row through that race.

### HR-11 — nit — honesty of a title — `tests/api/spawned.graybox.test.ts:61`

The title claims "(migrations applied, links work)". The database is already migrated, and SPEC/COVERAGE call the migration clause unverifiable. Rename to "(/healthz 200 and a create succeed)".

### HR-12 — nit — stale text

- `scripts/coverage.mjs:52` / `COVERAGE.md`: R-ERR-7 note says a 500 body must be "exactly" canonical; the code (`lib/http.ts:96-101`) correctly accepts JSON-equal per spec-v1.1. Say "JSON-equal".
- `package.json:6`: "(spec-v1)".

### HR-13 — nit — R-PRIV-1 database half — `tests/api/data.graybox.test.ts:10-20`

`clientAddress()` opens its own TCP connection to `localhost`; the actual request goes through fetch/node:http, which may resolve `localhost` to the other address family. A mismatch only weakens the search (it cannot cause a false failure). Derive the address from the same client path, or search both `127.0.0.1` and `::1` forms.

### HR-14 — nit — R-UI-12 — `tests/ui/home.spec.ts:227`

`waitForLoadState('networkidle')` is a precondition SPEC does not require. A UI that polls more often than every 500 ms never reaches networkidle and the test times out. Unlikely; replace with waiting for the form to be visible.

### HR-15 — nit — SPEC follow-up to HP-05

R-ERR-6 (match on the path) plus R-ERR-5/R-REDIR-3 (decode before lookup) imply route matching uses the raw segment, so `PUT /a%2Fb` is a matched `/{code}` → 405, whereas a router that decodes before matching gives an unmatched `/a/b` → 404. Not publicly tested, but a holdout variant could be. One sentence ("route matching uses the undecoded path; `%2F` does not split a segment") removes the ambiguity.

### HR-16 — nit — R-STATS-5 — `lib/assert.ts:105`

`expectStatsShape` requires every breakdown entry to have `clicks >= 1`. R-STATS-6 says this for `devices`; R-STATS-5 only says the counts are in-window. The harness reading (no zero-click entries) is the natural one and the gray-box tests assert exact arrays anyway; a half-sentence in R-STATS-5 would close it.

---

## The five coordinator choices

**HP-04 (R-ERR-7, JSON-equal).** Sound: byte equality is unobservable to any client and would only punish serializer whitespace. The wording "JSON-equal (not necessarily byte-equal)" is unambiguous and `openapi.json`'s `Internal` example matches. `lib/http.ts:96-101` enforces exactly this. No contradiction.

**HP-05 (percent-decode `/{code}` once).** Sound and the simpler of the two options; one rule for every code segment, consistent with R-ERR-5. The `GET /pct%2Dx` example makes it unambiguous, and the new tests (`redirect.test.ts:105-152`) match it exactly, including HEAD-records-no-click and the double-encoded 404. It does not contradict R-ROUTE-2: `%2e` segments are unmatched under R-ROUTE-2 before decoding is reached, and both readings give the same answer for every tested path. The one residual ambiguity (raw vs decoded matching for `%2F`, HR-15) predates v1.1 and is implied, not contradicted. WHATWG-consistent.

**HP-06 (`%2e`/`%2E` count as dot segments).** Sound and exactly what the WHATWG URL Standard does. The definition "`.` or `..` in any mix of literal dots and `%2e`/`%2E`" with examples is unambiguous, and the "404 regardless of method" restatement is tested for six methods (`routes.test.ts:113-181`), including decode-then-normalize paths that would reach a real link. The `Code` parameter pattern in `openapi.json` only bounds fuzzing and does not conflict. The only wording tension is R-ERR-8/R-REDIR-9 "everywhere" (HR-09); R-ERR-6's ordering resolves it.

**HP-08 (R-UI-5 further columns; controls in any cell).** Sound: it tolerates an "Actions" column, which every reasonable UI will have, without loosening the four named headers. The wording is clear, and the harness checks `slice(0, 4)` of the headers and locates controls by role within the row, not by cell. No contradiction. The one hole in the UI selectors is unrelated to this choice (HR-02).

**HP-10 (R-UI-12 scoped capture).** Sound: the original "no network request" was untestable in any framework with prefetching, and the scoped form still catches the realistic violations (a form post or server action is a POST; a classic submit is a navigation). The verification sentence is precise ("from activating Shorten until 1 s after the alert appears: no document navigation, and no request with a method other than GET or HEAD"), the unverifiable client-side GET is labeled, and `home.spec.ts:224-243` implements it line for line (`isNavigationRequest()` or non-GET/HEAD, captured from the click, released 1 s after the alert). The normative first sentence still says "no network request", which is stricter than what is verified; that is acceptable because the gap is labeled, but the rule and its label now say different things, so a reader should be told the label is the scope of verification, not a weakening of the rule.

**Labels for HP-09, HP-14, HP-15.** HP-15's *gray-box* label is honest: the proxy test (`spawned.graybox.test.ts:79-96`) really does forward → black-hole → require 503 on the next request. HP-14's *unverifiable* for "migrations run on an empty database" is honest under the current Configuration (no scratch database, no `CREATE DATABASE` right); it is "beyond reach" by decision rather than by nature, and the disposition says so. HP-09: R-UI-5's empty state is genuinely unverifiable on a shared database; R-UI-4's "anything else" row is unverifiable only if R-UI-4 is scoped to the create form (HR-10).

---

## What I checked

- **Every test against its SPEC rule**, line by line: the 14 API files, 4 invariants, 5 UI files, and the library they share (`http.ts` envelope/R-ERR-4/R-ERR-7 interceptor, `links.ts` polling and paging, `assert.ts`, `db.ts`, `spawn.ts`, `addr.ts`). Expected values in the stats/breakdown tests were recomputed by hand (code-point ordering of `x-y.io` < `xa.io`, `US` < `unknown`, the 7/8/365-day window edges with the seeded instants, top-5 cut-offs); all correct. The WHATWG cases (`http:example.com`, `https:////`, `0xc0.0xa8.1`, `[::1]` hostname, trailing-dot host, U+000B stripping, IDNA) match the standard and Node's implementation, which the harness uses as its oracle.
- **spec-v1.1 changes:** HP-05 (3 tests), HP-06 (21 tests), HP-07 (2 tests) and the rescoped R-UI-12 test match the new wording exactly; the SELF_CHECK per-file deltas (redirect 8→11, routes 48→69, url 46→48) match the sources.
- **False passes:** I looked for status-only or can't-fail assertions in every requirement and found none. The SELF_CHECK "strengthened" list is real in the code (25 codes must resolve to their own URL; redirect tests check `Location` against the created URL; `R-ERR-3` includes syntax cases no schema expresses; list-sorted needs ≥21 items; invariants `total` must move by exactly 1). Gray-box R-DATA-1/2/3 and R-PRIV-1 would catch a counter column, a stored IP, a `'direct'` string, or a trigger.
- **Honesty:** no `.only`, `.todo`, `fixme`, Playwright/Vitest retries, or unconditional skips; every skip is `ctx.skip(!hasDb|!hasBin, note)` with the `pending (gray-box)` prefix for `API_BIN`. `COVERAGE.md`'s 177 titles reproduce from the sources (178 `[R-…]` literals minus the one assertion message in `fixtures.ts`, which `coverage.mjs` excludes by file pattern). The `HARNESS_LENIENT_SETUP`/`HARNESS_RETRY_REFUSED` escape hatches are env-gated and documented as self-check only; the verification report should record that both were unset.
- **Verification rules:** shared-database, scheduling, time, client-UA, and fuzz rules are followed except for the letter-level deviations in HR-05, HR-07 and HR-08.

## What I could not check

- The hidden holdout suite (by design).
- Anything that requires running: whether `schemathesis==4.29.1` accepts `--max-redirects 0` and `--report junit,ndjson` exactly as written in `scripts/fuzz.mjs` (SELF_CHECK's smoke run implies it does); whether Node's fetch sends an empty `?` for `follow(code, {}, '?')`; the exact TCP teardown behaviour behind HR-03; and the pipe/pause interplay behind HR-06. Each is a few minutes with a throwaway server, and HR-03 is the one worth doing before the freeze.
- Playwright strict-mode behaviour on pages with framework live regions (Next.js's route announcer is `role=alert` and is empty on the paths these tests take, so I expect no interference, but only a run shows it).
