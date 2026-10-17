# Spec review, round 2 (adversarial)

**Inputs read:** `spec/SPEC.md`, `spec/openapi.json` only.
**Scope of this round:** what still blocks testing, contradictions (SPEC vs OpenAPI; Shared definitions vs Data contract vs Verification rules), precise-but-wrong wording, and requirements a harness can't verify as labeled. Things round 1 already fixed are not re-raised.

**Counts:** blocks testing: 3 · causes disagreement: 14 · minor: 15 · total: 32.

Format per finding: ID (requirement) — severity — problem — proposed rewording.

---

## Blocks testing

### R2-01 (R-OAS-1, R-ERR-2, openapi `CreateLinkRequest`, `offset`) — blocks testing
**Problem.** R-OAS-1 requires Schemathesis "with all checks, in positive and negative modes" and treats any check failure as a failure of the requirement. Current Schemathesis releases include `positive_data_acceptance` in "all checks": any request whose data is *valid under the schema* but is answered with a 4xx other than 401/403/404 fails the check. R-ERR-2 and the `CreateLinkRequest` description deliberately keep content rules (URL syntax, length, alias pattern, reserved, taken) *out* of the schema. So positive mode will generate `{"url":"0"}` (schema-valid, server says 422), `{"url":"https://a.b/","alias":"!"}` (422), `{"url":"https://a.b/","alias":"api"}` (422), and `GET /api/links?offset=18446744073709551616` (schema-valid since `offset` has no `maximum`, server says 400 per "Query integer"). Every run fails by construction, independent of the implementation. The spec's own precision (schema says one thing, server says another, "all checks") is self-defeating.
Related: the `unsupported_method` check sends undefined methods to each documented path and expects 405; if the pinned version includes HEAD in that set, it contradicts frameworks that auto-answer HEAD for GET routes (see R2-05).
**Rewording.** In "Verification rules → Fuzzing", replace "with all checks" with an explicit list: `not_a_server_error, status_code_conformance, content_type_conformance, response_headers_conformance, response_schema_conformance, negative_data_rejection, use_after_free, ensure_resource_availability, unsupported_method` and state "`positive_data_acceptance` is **not** run (R-ERR-2 keeps content rules out of the schema), or is run with expected statuses `2xx, 400, 404, 409, 422`." In `openapi.json`, add `"maximum": 9223372036854775807` to `offset`. State which methods `unsupported_method` is expected to send and that HEAD is excluded (or define HEAD, R2-05).

### R2-02 (R-HEALTH-1, R-DATA-3) — blocks testing
**Problem.** The 503 branch is verified by "a second api instance started with `DATABASE_URL` pointing at a closed port." R-DATA-3 says "the implementation's migrations create the schema" but never says *when* they run. An implementation that runs migrations at startup and exits when the connection fails (the most common pattern) never opens its port, so the harness gets a connection refused, not a 503. Both "run migrations at boot and exit on failure" and "serve anyway" conform to the text; only one is testable.
**Rewording.** Add to R-HEALTH-1: "The api opens its listening port and serves `/healthz` even when the database is unreachable at startup; it must not exit on a failed migration or connection attempt. Migrations are applied at startup once the database is reachable (retrying), or by a separate command the harness runs before the suite (`<binary> migrate`, documented in the implementation's README). The harness waits up to 10 s for the port to open before the 503 phase."

### R2-03 (R-UI-12, R-UI-11) — blocks testing (for the "sends no request" clause)
**Problem.** R-UI-12 says a whitespace-only submission "sends no request to the api." Under R-UI-11 the browser never talks to the api; the *web server* does. Browser network capture cannot see server-to-server calls, so this clause is unverifiable black-box and carries no gray-box label. An implementation that submits the form, has the web server call the api, gets 422 and renders the alert is indistinguishable from one that never submits, unless the harness tails api logs or interposes a proxy, which the spec doesn't provide for.
**Rewording.** Either make it observable from the browser: "…shows the `invalid_url` message with role `alert` **without any network request from the browser** (no fetch, XHR or navigation; checked by network capture)", or label it gray-box and define the probe: "*(gray-box: the api's request log shows no `POST /api/links` during the test)*", which also requires specifying that the api logs method and path for each request.

---

## Causes disagreement

### R2-04 (R-ERR-4 vs openapi examples for 404, 409, 422) — causes disagreement
**Problem.** R-ERR-4 forbids any `message` matching `(traceback|exception|panic|goroutine|sqlstate|stack)` (unanchored, case-insensitive) or `(/Users/|/home/|/usr/|/var/|/app/|[A-Z]:\\)`. The OpenAPI examples echo user input: `"No link with code 'nope'."`, `"The alias 'launch' is already in use."`. An implementer following the examples returns `"No link with code 'panic'."` for `GET /api/links/panic`, `"The alias 'stack-abc1' is already in use."`, or an `invalid_url` message quoting `https://x.com/home/`; a test author reading R-ERR-4 sends exactly those inputs and fails the implementation. The precise pattern list makes echoing any user-controlled string a violation while the examples instruct the implementer to echo.
**Rewording.** Pick one: (a) add to R-ERR-4 "Error messages never include request-supplied values (codes, aliases, URLs, header values)" and change the OpenAPI examples to `"No link with that code."`, `"That alias is already in use."`; or (b) scope R-ERR-4 to "messages on 500 and 503 responses, and the fixed text of 4xx messages before any echoed value," which is not black-box checkable, so (a) is preferred.

### R2-05 (R-ERR-6, R-ERR-1, R-REDIR-7, openapi `/api/*`, `/healthz`) — causes disagreement
**Problem.** HEAD on `/api/links`, `/api/links/{code}`, `/api/links/{code}/stats` and `/healthz` is undefined. R-ERR-6 reads literally as "unsupported method → 405 with JSON body", but a HEAD response cannot carry a body, so R-ERR-1's "body `{"error":…}`" is unsatisfiable for HEAD. Meanwhile Express, Go `net/http`, Spring and most routers answer HEAD for any GET route with the GET status and headers. Two conforming readings: `HEAD /healthz` → `200`, no body, or → `405`, `Allow: GET`. A test written from either reading fails the other implementation. R-ERR-6 also doesn't say whether `Allow` lists `HEAD`/`OPTIONS`.
**Rewording.** Add R-ERR-8: "`HEAD` on `/healthz` and on every `GET` route under `/api/` returns the status and headers of the corresponding `GET` with no body, and is not an unsupported method. `OPTIONS` is unsupported (405). The `Allow` header on a 405 lists the supported methods as a comma-separated set, `GET` routes also listing `HEAD`; tests compare the set, not the string." Add `head` operations (or a note) to `openapi.json` accordingly.

### R2-06 (R-ERR-6, R-ERR-5, R-REDIR-9, R-ROUTE-1) — causes disagreement
**Problem.** Precedence of method check vs. code lookup is undefined for `/api/links/{code}*`. `PUT /api/links/doesnotexist` → `405 method_not_allowed` (route pattern known, method not) or `404 not_found` (lookup first)? R-ERR-5 only orders query validation before lookup. R-REDIR-9 implies method-first for `/{code}` but says nothing about `/{code}/` or other `text/plain` paths: `POST /abc1234/` → 404 (R-ROUTE-1) or 405 (R-REDIR-9)?
**Rewording.** Add to R-ERR-6: "Order of checks on every path: (1) route match on the exact path; an unmatched path is 404 regardless of method; (2) method; an unsupported method on a matched route is 405 regardless of whether the code exists; (3) query validation (R-ERR-3); (4) code lookup. So `PUT /api/links/{anything}` → 405 and `POST /{code}/` → 404 `text/plain`."

### R2-07 (R-REDIR-3 vs R-ERR-1 / R-ERR-6) — causes disagreement
**Problem.** R-REDIR-3 says `GET /api/` → 404 `text/plain`. R-ERR-1 says every 4xx "from any path under `/api/`" is JSON and "the only non-JSON errors are on `/{code}`"; R-ERR-6 says an unrouted path under `/api/` → 404 `not_found` JSON. Whether `/api/` is "under `/api/`" is a matter of reading. An implementer with a prefix-mounted `/api` router returns JSON for `/api/`; the test (from R-REDIR-3) expects `text/plain`. R-ROUTE-1's `/{code}/` rule happens to agree with R-REDIR-3, so three rules describe one path with two answers.
**Rewording.** In R-ERR-1 and R-ERR-6 replace "any path under `/api/`" with "any path of the form `/api/<non-empty remainder>`". In R-REDIR-3 keep "`/api` and `/api/` are handled as `/{code}` and `/{code}/` (text/plain)".

### R2-08 (R-ERR-3, "Query integer") — causes disagreement
**Problem.** R-ERR-3 says `limit`, `offset` and `days`, "when present," must be valid query integers, with no endpoint scoping; "Query integer" says unknown parameters are ignored. `GET /api/links/{code}?days=0` and `GET /api/links?days=abc`: a global validator returns 400, a per-endpoint validator returns 200 (unknown → ignored). Both conform.
**Rewording.** R-ERR-3: "`limit` and `offset` are validated only on `GET /api/links`; `days` only on `GET /api/links/{code}/stats`. On every other endpoint they are unknown parameters and ignored (R-REDIR-8 for `/{code}`)."

### R2-09 (R-ERR-5, R-ROUTE-1, R-REDIR-3, R-OAS-1) — causes disagreement
**Problem.** Several request shapes are answered by the HTTP server layer before the application routes them, and the spec assigns them application-level answers:
- Malformed percent-escapes: `GET /api/links/%ZZ`. R-ERR-5 says "values no code could have → 404 `not_found`". Go's `net/http` rejects the request line with a plain-text 400 before any handler runs; Node passes it through. Two conforming stacks, two responses.
- Dot segments and empty segments: `GET /../abc1234`, `GET //abc1234`, `GET /api/links/./x`. "Paths match exactly" implies 404; Go's `ServeMux` answers 301 to the cleaned path; others 404.
- Overlong request-URI (`/api/links/` + 20,000 chars): 414 or 431 plain text from most servers, vs. 404 JSON per R-ERR-5/R-ERR-1.
Schemathesis (R-OAS-1) generates path parameters containing `%`, `.`, `/` and long strings; a 301/400/414 from the server layer is an undocumented status and fails `status_code_conformance`, so R-OAS-1 becomes stack-dependent.
**Rewording.** Add R-ROUTE-2: "The api never redirects to a normalized path. Paths containing dot segments, empty segments or malformed percent-escapes are unmatched paths: `/{…}`-shaped → 404 `text/plain`, `/api/<…>` → 404 `not_found`. Request URIs longer than 8 KiB may be rejected by the server with any 4xx and any body; tests never send them." In `openapi.json`, give `Code` `"maxLength": 64` and `"pattern": "^[^/%.]+$"` so Schemathesis stays inside the application's domain, and note in Verification rules that generated path values are bounded by that schema.

### R2-10 ("Query integer", R-ALIAS-1) — causes disagreement
**Problem.** Both regexes are anchored with `$`. In Python (`re.match` / `re.fullmatch` aside), Ruby and PCRE without `D`, `$` also matches before a final `\n`; in JavaScript, Go RE2 and Rust it matches only at the end. So `{"alias":"abc\n"}` → Python-based server: 201 with code `"abc\n"` (then R-LINK-2 "exactly as sent" produces a code with a newline, unreachable over HTTP); JS/Go server: 422 `invalid_alias`. Likewise `?limit=20%0A`.
**Rewording.** In Shared definitions: "Regular expressions in this spec match the **entire** string; a trailing newline does not match `$` (i.e. `\A…\z` semantics). `"abc\n"` is not a valid alias and `20\n` is not a query integer."

### R2-11 ("Timestamps", R-GET-1, R-LIST-1, openapi `date-time`) — causes disagreement
**Problem.** "Optional fractional seconds of at most 6 digits" plus "at full stored precision" leaves the serialized form open. For a seeded `clicked_at = D 00:00:00Z`, `2026-10-17T00:00:00Z` and `2026-10-17T00:00:00.000000Z` both conform; for `D-1 23:59:59.5Z`, `…59.5Z` and `…59.500000Z` both conform. A test author who writes string equality against the seeded literal (natural reading of "full stored precision") fails one of two correct implementations.
**Rewording.** Either fix the format ("fractional seconds are always 6 digits" or "trailing zeros are removed and the fraction is omitted when zero") or add to Verification rules: "Timestamps are compared as instants after parsing, never as strings." Do the same for `createdAt`.

### R2-12 (R-REDIR-7) — causes disagreement
**Problem.** "`HEAD /{code}` returns the same status and headers as `GET`" cannot be literally true: `Date` differs, `Content-Length` is commonly omitted or differs for HEAD, and a 302 body (if any) affects `Content-Type`/`Content-Length` only on GET. A test comparing header maps fails every implementation; a test comparing only `Location` passes implementations that drop `Cache-Control` on HEAD.
**Rewording.** "`HEAD /{code}` returns the same status as `GET`, the same `Location` and `Cache-Control` values on 302 and the same `Content-Type` on 404, with no body, and records no click. Other headers are not compared."

### R2-13 (R-PRIV-1) — causes disagreement (false failure)
**Problem.** The gray-box check "searches the api's stdout and stderr for the test client's address." Locally the client address is `127.0.0.1` or `::1`. Nearly every server logs its bind address at startup (`listening on 127.0.0.1:8080`), and the Postgres URL or an error may mention `127.0.0.1:5432`. The search matches and a compliant implementation fails. Also undefined: whether `::ffff:127.0.0.1` counts, and whether the search covers the whole run (including the R-HEALTH-1 instance).
**Rewording.** "*(gray-box: schema inspection, plus a search of api stdout/stderr lines emitted **after the first request of the suite** for the client's address in any textual form, including IPv4-mapped IPv6. Startup lines are excluded. The harness runs its client from an address different from the api's bind address and the database host where possible, and records which address it searched for.)*"

### R2-14 (Verification rules "Shared database", R-LINK-6, R-UI-5, R-LIST-1) — causes disagreement (hidden flakiness)
**Problem.** The Shared-database rule permits concurrent suites and R-LINK-6 creates 1,000 links. R-UI-5 asserts the home page lists "the 20 newest links" and R-UI-6 finds the row `Delete {code}` for a link the UI test just created; if the API suite creates 20+ links between the UI's create and its re-fetch, the row is gone and the test fails on a correct system. R-LIST tests "assert the relative order of their own links," but with offset pagination and concurrent inserts a test's links can be pushed past `offset+limit` between two requests, so even relative order on one page is not stable.
**Rewording.** Add to Verification rules: "UI suites and the R-LINK-6 bulk-create test never run concurrently with each other or with list-order tests. A list-order test fetches with `limit=100` and pages forward until all of its own links are found (bounded by `total` at the first call) before asserting their relative order. A UI test that needs its link in 'Your links' re-creates it if the table no longer shows it, at most once."

### R2-15 (R-UI-1, R-UI-3, R-LINK-3) — causes disagreement
**Problem.** The API never trims aliases (R-LINK-3); the UI's treatment of the alias field is unspecified. Typing `" promo "`: a UI that sends it verbatim gets 422 and shows the `invalid_alias` message; a UI that trims gets 201 and a link named `promo`. Both conform. R-UI-2 specifies trimming for the destination only.
**Rewording.** Add to R-UI-2: "The alias is sent exactly as typed, untrimmed; an empty alias field is sent as `""` or omitted." (Or "is trimmed of ASCII whitespace", but pick one.)

### R2-16 (R-UI-5, R-UI-10, Verification "Shared database") — causes disagreement
**Problem.** The database "isn't assumed empty," which includes being empty at the start of a UI run. R-UI-5 says `/` "shows a table named 'Your links'"; with zero links an implementation that renders "No links yet" instead of an empty table conforms to a reasonable reading, while the axe state "`/` with an empty form" and the harness's table lookup assume the table exists. R-UI-7 settles this for the stats tables ("an empty table has no body rows") but R-UI-5 doesn't.
**Rewording.** Add to R-UI-5: "The table is always present with exactly one header row; with no links it has no body rows, and any 'no links' text is outside the table."

### R2-17 (R-STATS-1, R-ERR-5) — causes disagreement
**Problem.** R-ERR-5 percent-decodes the path once before lookup; R-STATS-1 says the response `code` "echoes the path code." For `GET /api/links/%61bc1234/stats` (link `abc1234` exists) the echo is `abc1234` (decoded) or `%61bc1234` (raw). 
**Rewording.** "The response `code` equals the link's stored `code` (the decoded path segment)."

---

## Minor

### R2-18 (R-DATA-2 vs R-CLICK-1) — minor
**Problem.** R-CLICK-1 maps `Referer: https://direct/` to hostname `direct` (a valid single-label host). R-DATA-2 says `referrer_host` "never" holds `'direct'`. One rule must give. Same for `https://www.direct/` → `direct`.
**Rewording.** Add to R-CLICK-1: "A normalized host equal to `direct` is stored as `NULL` (reported as `direct`)." Or drop "or `'direct'`" from R-DATA-2.

### R2-19 (R-LINK-7) — minor (untestable)
**Problem.** "On a collision the server regenerates" cannot be exercised: codes come from a 62^7 space and can't be seeded (the harness never supplies codes). The reserved-alias clause is vacuous (reserved aliases are ≤ 7 chars but none is exactly 7 chars of the code alphabet… `healthz` **is** 7 chars, so it is not vacuous for that one, yet still unforceable). The clause is unlabeled.
**Rewording.** Label "*(not verified; by inspection)*", or make it mutant-verifiable with a gray-box hook: "When the environment variable `CODE_SEED` is set, code generation is deterministic from it (documented sequence); the harness uses it to force a collision." If neither, keep only "A request with no alias never returns 409."

### R2-20 (R-HEALTH-1) — minor (partly untestable)
**Problem.** "Runs `SELECT 1` on every request" and "timeout of at most 2 s" are not exercised by a closed port (connection refused is instant), and neither is labeled. A `/healthz` that caches the last DB result for 30 s passes every described test.
**Rewording.** Make the 503 phase use a black-hole listener: "the harness opens a TCP listener that accepts and never responds; `DATABASE_URL` of the second instance points at it; `/healthz` must return 503 within 3 s." Label "`SELECT 1` on every request" *(mutant-verified)* or verify via gray-box `pg_stat_statements`/`log_statement`.

### R2-21 (R-UI-8) — minor
**Problem.** "An invalid `days` value renders as if `days=30`" doesn't say what invalid means for the UI; `?days=007` or `?days=7.0` may be parsed as 7 by a lenient UI and treated as invalid by one applying the "Query integer" definition. Also unstated whether "30 days" has `aria-current="page"` when `days` is absent.
**Rewording.** "`days` is valid iff it is a query integer (Shared definitions) in 1–365. With no `days`, the page behaves exactly as `days=30`, including `aria-current` on '30 days'."

### R2-22 (R-UI-5) — minor
**Problem.** "Created is `createdAt` in UTC as `YYYY-MM-DD HH:MM`" — `15:04:59Z` renders `15:04` (truncate) or `15:05` (round, as some date libraries do). Exact-text matching makes this a real failure.
**Rewording.** "…as `YYYY-MM-DD HH:MM`, seconds truncated."

### R2-23 (R-UI-2, R-URL-4) — minor
**Problem.** The example `localhost:3000/x` → `https://localhost:3000/x` is unobservable under default config: the api rejects it with 422 (`localhost` = `PUBLIC_BASE_URL` host, ports ignored), and if the UI had sent it unchanged the api would also return 422 (`localhost:` scheme). A test of this example cannot distinguish conforming from non-conforming UIs.
**Rewording.** Use `example.com:8443/x` → `https://example.com:8443/x` as the example.

### R2-24 (Verification "Fuzzing" vs "Configuration") — minor
**Problem.** Fuzzing "runs against a dedicated database," which requires a second api instance (non-default `DATABASE_URL`, and a non-default `PORT` if concurrent with the main instance, with `PUBLIC_BASE_URL` then mismatching). "Configuration" says the only non-default phase is the R-HEALTH-1 503 phase.
**Rewording.** "Configuration: …The exceptions are the R-HEALTH-1 503 phase and the Schemathesis instance, which runs with its own `DATABASE_URL` and `PORT` (with `PUBLIC_BASE_URL` matching that port)."

### R2-25 (Verification "Time", R-STATS-2/3) — minor (hidden flakiness)
**Problem.** The "retry once if the date changed" rule applies only to clicks "recorded through the API." Seeded-row tests are anchored to `D` read before seeding; if midnight passes before the stats call, `days=1` no longer includes `D 00:00:00Z` and the test fails on a correct system.
**Rewording.** "Any test anchored to `D` re-reads today after its assertions and retries once from the start if it changed."

### R2-26 (R-REDIR-9, R-ERR-6) — minor
**Problem.** "`Allow: GET, HEAD`" reads as an exact string; frameworks emit `GET,HEAD` or `HEAD, GET`.
**Rewording.** "…with an `Allow` header whose comma-separated set of methods is exactly {`GET`, `HEAD`}."

### R2-27 (R-CLICK-1) — minor (gap)
**Problem.** R-CLICK-2 defines repeated headers; R-CLICK-1 doesn't. Two `Referer` headers: Node joins them into `a, b` (parse fails → `direct`), Go keeps both (first → host). Non-ASCII bytes in the header value: decoded as Latin-1 or UTF-8 before parsing?
**Rewording.** "If `Referer` appears more than once → `direct`. The header value is decoded as UTF-8; invalid bytes make it fail to parse."

### R2-28 (R-ALIAS-2, R-REDIR-3) — minor (gap)
**Problem.** `docs`, `openapi.json`, `static`, `assets` are reserved, suggesting the api may serve them, but R-REDIR-3 requires 404 `text/plain` for any path that isn't a code. An api serving Swagger UI at `/docs` violates R-REDIR-3 as written. `GET /` on the api is also undefined (empty code → 404 `text/plain`? landing page?).
**Rewording.** "The api serves nothing at `/` or at reserved paths in v1; they return 404 `text/plain` like any unknown code." (Or enumerate what it serves.)

### R2-29 (R-ERR-2) — minor (gap)
**Problem.** JSON edge cases parsers disagree on: duplicate keys (`{"url":"x","url":"https://a.b/"}` — last wins, first wins, or reject), lone surrogates (`"\ud800"`) and invalid UTF-8 bytes (some parsers reject → 400, others accept → then WHATWG parses with U+FFFD).
**Rewording.** "Duplicate keys: the last value wins. A body that is not valid UTF-8, or contains an unpaired surrogate escape, is malformed → 400."

### R2-30 (R-URL-5 vs openapi `format: uri`) — minor
**Problem.** WHATWG serialization leaves `|`, `^`, `[`, `]` and `{}` (query) unencoded in paths, so `https://example.com/a|b` is stored and returned byte-for-byte as `https://example.com/a|b`, which is not an RFC 3986 URI. `Link.url`, `shortUrl` and `Location` are declared `format: uri`; if the Schemathesis build validates formats, R-OAS-1 fails on a correct response.
**Rewording.** Drop `format: uri` from `Link.url` and `Location` (keep a description), or note in Verification rules that format assertions are disabled.

### R2-31 ("Query integer") — minor
**Problem.** Whether the value is matched raw or after `application/x-www-form-urlencoded` decoding is unstated: `?limit=%32%30` and `?limit=+20` — raw: not a query integer → 400; decoded: `20` → 200 (and `+20` → ` 20` → 400).
**Rewording.** "The value is percent-decoded (and `+` is a plus sign, not a space) before matching."

### R2-32 (R-UI-3) — minor (hidden flakiness)
**Problem.** Clipboard writes are only observable in Chromium with `clipboard-read`/`clipboard-write` granted; Firefox/WebKit drivers cannot read the clipboard, and headless modes vary.
**Rewording.** Label: "*(verified in Chromium with clipboard permissions granted; the harness reads `navigator.clipboard.readText()` after activation)*."

---

## Notes on what was checked and found consistent
R-URL-5 normative examples agree with the WHATWG parser; R-CLICK-1 examples agree with the definitions; "Name order"/`COLLATE "C"` is consistent for the ASCII names that can occur; R-STATS-3 window, R-STATS-5 tie-breaking and R-DATA-2 encodings are mutually consistent; R-ERR-2 precedence, the 64 KiB rule and the OpenAPI response lists agree; R-REDIR-4/5 timing and the harness polling rule agree.
