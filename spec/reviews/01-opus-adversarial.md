# Spec review: Shortlink spec (DRAFT, pre `spec-v1`)

**Inputs reviewed:** `spec/SPEC.md` and `spec/openapi.json`. Nothing else was read.
**Reviewer stance:** adversarial. Each finding describes a way that a test author and an implementer, both reading in good faith, could end up disagreeing. Product choices are not judged.

## Summary

| Severity | Count |
|---|---|
| blocks testing | 7 |
| causes disagreement | 33 |
| minor | 16 |
| **Total** | **56** |

Types used below: **A** = ambiguity, **C** = contradiction, **U** = untestable, **G** = gap, **F** = hidden flakiness. Several findings have more than one type.

Findings are ranked by severity. Within a severity, the findings with the widest effect come first.

---

## Blocks testing

### F-01. The storage encoding for seeded click rows is not specified
- **IDs:** R-CLICK-1, R-CLICK-2, R-STATS-5, Data model · **Severity:** blocks testing · **Type:** G, A
- **Problem:** The time-window tests seed `clicks` rows directly, but the spec defines only the *reported* names (`direct`, `unknown`), not the stored values. `referrer_host TEXT` is nullable, so "direct" could be stored as `NULL`, `''` or `'direct'`. `country CHAR(2)` can't hold `unknown`, so it could be stored as `NULL`, `''` (padded to `'  '`) or `'XX'`. The spec also doesn't say whether normalization (lowercasing, `www.` stripping, uppercasing) happens on write or on read.
  - The harness seeds `referrer_host = ''`. Impl A stores direct as `NULL` and reports a referrer named `""`. Impl B stores direct as `''` and reports `direct`.
  - The harness seeds `referrer_host = 'WWW.News.com'`. Impl A normalizes on write and reports `WWW.News.com`. Impl B normalizes on read and reports `news.com`.
  - The harness seeds `country = 'us'`. Impl A reports `us`. Impl B uppercases on read and reports `US`.
- **Proposed wording (add to Data model):** "Column encoding is normative. `referrer_host` holds the host already normalized per R-CLICK-1, or `NULL` for `direct`. It is never `''` or `'direct'`. `country` holds two uppercase ASCII letters, or `NULL` for `unknown`. `device` holds one of the five lowercase values. Implementations normalize on write and report stored values unchanged, mapping `NULL` to `direct` or `unknown`. The harness seeds only values in this form."

### F-02. Click-derived fields may come from a counter or cache, which would hide seeded rows
- **IDs:** R-GET-1, R-LIST-1, R-STATS-1..6, Data model · **Severity:** blocks testing · **Type:** G
- **Problem:** No rule requires `clickCount`, `lastClickedAt`, `totalClicks`, `rangeClicks` or the breakdowns to be computed from the `clicks` rows. A counter column `links.click_count` is an obvious way to satisfy R-REDIR-5, and so is a daily rollup table or an in-memory cache. "No other tables or columns exist that store request data" doesn't forbid any of these, since a counter isn't request data. The spec also doesn't say:
  - who creates the schema (implementation migrations or the harness)
  - whether extra tables, columns or triggers are allowed
  - whether the harness may insert explicit `id` values, which fails under `GENERATED ALWAYS`
  - whether the harness may seed `links` rows with a backdated `created_at`, which interacts with F-14
  
  Example: the harness seeds 3 backdated clicks. Impl A computes from rows and returns `totalClicks: 3`. Impl B uses a counter and returns `totalClicks: 0`, `clickCount: 0`.
- **Proposed wording:** "Every click-derived field (`clickCount`, `lastClickedAt`, `totalClicks`, `rangeClicks`, `daily`, `topReferrers`, `topCountries`, `devices`) is computed from the `clicks` rows when the request runs. A row inserted directly into `clicks`, with any `clicked_at`, shows up in every such field on the next request. Nothing is cached. The implementation's migrations create exactly these tables and columns. Extra indexes and a migration-bookkeeping table are allowed. Triggers, and columns or tables that duplicate click data, are not. The harness never supplies `id` and relies on column defaults for any column it omits. The harness may insert `links` rows with an explicit `created_at`."

### F-03. `openapi.json` rejects requests that `SPEC.md` accepts, and R-OAS-1 makes both binding
- **IDs:** R-LINK-3, R-ALIAS-1, R-ERR-2, R-OAS-1 · **Severity:** blocks testing · **Type:** C
- **Problem:**
  1. `CreateLinkRequest.alias` has `pattern ^[A-Za-z0-9_-]{3,32}$`, which excludes `""`. Yet R-LINK-3, and the schema's own `description`, say `""` means no alias, so the request should get 201. Schemathesis negative testing (the `negative_data_rejection` check) sends `{"url":"https://example.com","alias":""}` and expects a 4xx. A SPEC-conformant implementation returns 201, so it fails R-OAS-1. No implementation can satisfy both.
  2. Because of the same pattern, an implementation that validates requests against the OpenAPI document (common middleware) returns **400** `bad_request` for `{"alias":"ab"}`. R-ALIAS-1 requires **422** `invalid_alias`. R-ERR-2 gives 400 to "wrong types", and schema validators don't separate a pattern failure from a type failure.
  3. `additionalProperties: false` has no counterpart in SPEC.md. For `{"url":"https://example.com","foo":1}`, impl A ignores the extra field and returns 201. Impl B returns 400. Schemathesis negative mode treats impl A as a failure.
- **Proposed wording:** In openapi.json, remove `pattern` from `alias` (or use `anyOf: [{const:""},{pattern:…}]`) and note "format checked by R-ALIAS-1, 422". Then pick one rule for extra fields and state it in both files: either "Unknown request-body fields are ignored" (and remove `additionalProperties:false`), or "Unknown fields → 400 `bad_request`" (and add this to R-ERR-2). Add to R-ERR-2: "Checks on string content (length, pattern, URL syntax, reserved, taken) are never 400. They follow R-URL and R-ALIAS."

### F-04. The `url` maxLength in openapi.json applies before trimming and returns a different status
- **IDs:** R-URL-1, R-URL-3, R-OAS-1 · **Severity:** blocks testing · **Type:** C
- **Problem:** Consider `url` = `" " + <valid 2048-char URL> + " "`, which is 2050 characters raw. SPEC trims it to 2048 and returns **201**. The schema's `maxLength: 2048` makes the raw value schema-invalid, so a validating implementation returns **400**, and Schemathesis negative mode expects a rejection. For a 2049-character URL with no whitespace, SPEC requires **422** `invalid_url`, while a schema-validating implementation returns **400** `bad_request`.
- **Proposed wording:** Remove `maxLength` from `CreateLinkRequest.url` in openapi.json. Instead, describe the limit: "At most 2048 characters after trimming. Longer → 422 `invalid_url` (R-URL-3)." See F-25 for the unit of length.

### F-05. The R-OAS-1 verdict depends on a Schemathesis configuration that isn't pinned
- **IDs:** R-OAS-1 · **Severity:** blocks testing · **Type:** U, A, F
- **Problem:**
  - The verdict depends on settings the spec doesn't fix: which checks run (`not_a_server_error`, `status_code_conformance`, `content_type_conformance`, `response_schema_conformance`, `negative_data_rejection`, `unsupported_method`, `use_after_free`…), positive or negative generation, stateful mode, example count, seed and version. The same implementation passes under one setup and fails under another.
  - No operation documents **500**, **405**, **413** or **415**. The `ErrorResponse` enum contains `internal`, but no response uses it. It's unclear whether any 500 is a conformance failure, or whether `405` for `PUT /api/links` is. The `unsupported_method` check expects a 405 with an `Allow` header.
  - On `/{code}`, if the client follows redirects, it ends up fetching external destinations.
  - Schemathesis POSTs create thousands of links and random aliases in the shared database. That breaks list tests, `total` assertions, the UI table and fixed-alias tests that run at the same time (see F-15).
- **Proposed wording:** "R-OAS-1 is checked with Schemathesis `<exact version>` using `--checks all` (minus `<list>`), `--mode <positive|all>`, `--max-examples <N>` and `--seed <S>`. Redirects are not followed. It runs against a separate database, or serially after the functional suite. Any 5xx observed fails R-OAS-1." Also, in openapi.json, either document `405` (with `Allow`, as an ErrorResponse) and `500` (`internal`) on every operation, or state that they must never occur.

### F-06. "The parser's normalized form" (R-URL-5) depends on which parser is used
- **IDs:** R-URL-5, R-URL-2, R-REDIR-1 · **Severity:** blocks testing · **Type:** A
- **Problem:** URL parsers disagree on both validity and serialization:
  | Input | WHATWG (JS `URL`, Rust `url`, ada) | Go `net/url` / Python `urllib` |
  |---|---|---|
  | `https://example.com` | `https://example.com/` | `https://example.com` (no slash, which contradicts the spec's own example) |
  | `HTTPS://Example.COM:443/a/../b` | `https://example.com/b` | mostly unchanged |
  | `https://bücher.example/ä` | `https://xn--bcher-kva.example/%C3%A4` | raw Unicode, which is an invalid `Location` header and fails `format: uri` |
  | `https://example.com/a b` | `https://example.com/a%20b` | rejected, or kept with a raw space |
  | `http:example.com`, `http:///example.com` | **valid**, giving `http://example.com/` | rejected (empty host), so the R-URL-2 verdict flips |
  | `https://example.com\path` | `https://example.com/path` | rejected or kept |
  
  A test that asserts any normalized form other than the single example can't be written to the spec.
- **Proposed wording:** "URLs are parsed with the WHATWG URL Standard's basic URL parser with no base URL. A URL is valid if and only if parsing succeeds, the scheme is `http` or `https`, and the host is non-empty. The stored and returned `url` and the `Location` header are the parser's `href` serialization, byte for byte." Then add the table above as normative examples.

### F-07. The 503 branch of R-HEALTH-1 can't be tested black-box
- **IDs:** R-HEALTH-1 · **Severity:** blocks testing · **Type:** U, G
- **Problem:** Making Postgres unreachable takes infrastructure control that HTTP doesn't provide. "Reachable" isn't defined either: it's unclear whether the check runs per request or is cached, and with what timeout. Against a hung database, `/healthz` might never respond, which neither branch covers. As written, half of this ID will be reported **unverified**.
- **Proposed wording:** "`GET /healthz` runs `SELECT 1` on every request with a timeout of at most 2 s. It responds within 3 s with 200 `{"status":"ok"}`, or with 503 and an ErrorResponse whose `code` is `unavailable`. *(503 branch: gray-box. Verified by stopping Postgres, or pointing `DATABASE_URL` at a closed port, in a dedicated harness phase, or by a mutant.)*"

---

## Causes disagreement

### F-08. R-ALIAS-2 lists reserved names that R-ALIAS-1 always rejects first
- **IDs:** R-ALIAS-2, R-ALIAS-1, R-ERR-2 · **Type:** C
- **Problem:** `openapi.json`, `favicon.ico` and `robots.txt` contain `.`, so they fail R-ALIAS-1. R-ERR-2 puts R-ALIAS-1 ahead of R-ALIAS-2, so these names can never yield `alias_reserved`. For `{"alias":"robots.txt"}`, a test written from R-ALIAS-2 expects `alias_reserved`, while an implementation that follows R-ERR-2 returns `invalid_alias`.
- **Proposed wording:** Add to R-ALIAS-2: "The dotted entries can't be reached, because R-ALIAS-1 rejects them first with `invalid_alias`. They are listed only to record the route namespace. Example: `{"alias":"robots.txt"}` → 422 `invalid_alias`. `{"alias":"API"}` → 422 `alias_reserved`."

### F-09. R-URL-4: is "host" the hostname, or host plus port?
- **IDs:** R-URL-4 · **Type:** A
- **Problem:** With `PUBLIC_BASE_URL=http://localhost:8080`:
  - `http://localhost:3000/x` is a 422 if "host" means the hostname, but a 201 if it means WHATWG `URL.host` (`localhost:3000` ≠ `localhost:8080`).
  - `http://localhost/x` gets the same split.
  - Variants are also undefined: `http://LOCALHOST:8080/`, `http://localhost.:8080/`, `http://127.0.0.1:8080/`, `http://[::1]:8080/`.
  
  A test author who points links at a local echo server breaks against the hostname reading.
- **Proposed wording:** "…whose **hostname** (after WHATWG parsing, so lowercased and IDNA-encoded) equals the hostname of `PUBLIC_BASE_URL` → 422. The port is ignored. There is no DNS or IP equivalence: `127.0.0.1` is not `localhost`. The trailing dot is not stripped. Tests use destination hosts other than that hostname, such as `example.com`."

### F-10. Precedence between 404 and 400 on code routes is unspecified
- **IDs:** R-ERR-3, R-ERR-5, R-STATS-1 · **Type:** A
- **Problem:** `GET /api/links/doesNotExist/stats?days=0` could return 400 (validate the query first) or 404 (look up the code first).
- **Proposed wording:** "On `/api/links/{code}*`, query-parameter validation (400) runs before code lookup (404)." The opposite order is also fine, as long as one is chosen.

### F-11. Codes in the path that can never be valid
- **IDs:** R-ERR-5, R-REDIR-3, openapi `components.parameters.Code` · **Type:** C, G
- **Problem:** The `Code` path parameter has a pattern, but GET and DELETE on `/api/links/{code}`, and GET on `/{code}`, document no 400.
  - `GET /api/links/ab`, `/api/links/foo.bar` and `/api/links/%C3%A9t%C3%A9` could return 404 `not_found` (impl A) or 400 `bad_request` via request validation (impl B). Impl B fails R-OAS-1 on GET but not on `/stats`, where 400 is documented.
  - `GET /ab` could return a `text/plain` 404, or the framework's default 404 (HTML or JSON).
  - Whether path segments are percent-decoded before lookup is also undefined: does `/la%75nch` match `launch`?
- **Proposed wording:** "Any value in the `{code}` position that doesn't identify an existing link is *unknown*. That includes values no code could have (wrong length, other characters, non-ASCII). Unknown codes get 404 `not_found` (JSON) on `/api/links/{code}*` and 404 `text/plain` on `/{code}`. Path segments are percent-decoded once before lookup." In openapi.json, drop `pattern` from the path parameter or mark it informative.

### F-12. `limit` over 100 (and `limit=0`): clamp or 400?
- **IDs:** R-LIST-1, R-LIST-2, R-ERR-3 · **Type:** A, C
- **Problem:** "max 100" combined with "echo the values **in effect**" suggests clamping. R-ERR-3 and the openapi `maximum` suggest 400.
  - `GET /api/links?limit=500`: impl A returns 400. Impl B returns 200 with `"limit":100`.
  - `limit=0`: SPEC sets no minimum, while openapi has `minimum: 1`. Impl A returns 400. Impl B returns 200 with empty `items`.
  - `offset` ≥ `total` is also undefined.
- **Proposed wording:** "`limit` is an integer from 1 to 100 and `offset` an integer ≥ 0. Any other value → 400 `bad_request`. Nothing is clamped. The response's `limit` and `offset` are the requested values or the defaults. If `offset` ≥ `total`, the response is 200 with `items: []` and the correct `total`."

### F-13. Integer syntax for query parameters is unspecified
- **IDs:** R-ERR-3 · **Type:** A, G
- **Problem:** The spec doesn't say how to treat `limit=05`, `+5`, `5.0`, `1e1`, `%205`, `limit=` (empty), `limit=5&limit=10`, `days=-0` or `offset=99999999999999999999`, which overflows 64 bits and invites a 500. JS `Number()` accepts `5.0`, `1e1` and `+5`. A strict regex rejects all three. Unknown parameters (`?foo=1`) are also unaddressed.
- **Proposed wording:** "A query integer must match `^(0|[1-9][0-9]*)$`. Anything else → 400, including an empty value or a repeated parameter. Values outside the allowed range → 400, including values too large for 64-bit integers, and never 5xx. Unknown query parameters are ignored."

### F-14. Newest-first order has no tie-break and no stated sort key
- **IDs:** R-LIST-1, R-UI-5 · **Type:** A, F
- **Problem:** Links created in the same transaction, with a coarse clock, concurrently or by seeding can share `created_at`, and their order is then undefined. Tests that assert order become flaky. Sort key `created_at` vs `id`: if the harness seeds a link with an old `created_at`, an implementation that orders by `id` lists it first.
- **Proposed wording:** "Ordered by `created_at` descending, then by `id` descending."

### F-15. Concurrent tests share one database
- **IDs:** R-LIST-1, R-LIST-2, R-UI-5, R-ALIAS-3, R-ALIAS-5, R-DEL-2, R-OAS-1 · **Type:** F, G
- **Problem:**
  - `total` changes whenever any other test (or Schemathesis) creates or deletes a link, so "create 3, expect `total` + 3" is flaky.
  - Page 1 contains other tests' links. If 20 or more links are created concurrently, a UI test's own row leaves the default page and "Delete {code}" can't be found.
  - Fixed aliases, including the openapi example `launch`, collide across tests and with aliases Schemathesis generates. A test then gets 409 where it expects 201.
  - The spec doesn't say whether the database starts empty or whether the harness may truncate it.
- **Proposed wording (new "Test isolation" section):** "The database is not assumed empty, and other clients may create or delete links at any time. The harness never truncates during a run. Tests don't assert absolute `total` values or absolute list positions. They assert the relative order of their own links, and that `total` ≥ the number of links they created. Every alias a test uses includes a unique random suffix. Schemathesis (R-OAS-1) runs against its own database or serially."

### F-16. Midnight UTC and clock skew in stats tests
- **IDs:** R-STATS-2, R-STATS-3, R-REDIR-4, R-UI-7 · **Type:** F
- **Problem:**
  - The harness computes "today" from its own clock. The api uses its clock, and `clicked_at DEFAULT now()` uses the database clock. Near 00:00 UTC, `daily[last].date` doesn't match the harness's idea of today.
  - A redirect at 23:59:59.8 followed by stats at 00:00:00.3 with `days=1` gives `rangeClicks: 0`, so "redirect, then expect `rangeClicks == 1`" fails.
  - Seeding "yesterday" as `now() - 24h` lands on the day before yesterday shortly after midnight.
- **Proposed wording:** In SPEC: "'Today' and 'now' come from the database clock (`now()` in UTC) when the stats query runs." In harness guidance: "Tests take 'today' from `daily[last].date`, never from the harness clock. Tests that rely on the date of a click recorded through the API use `days ≥ 2`, or retry once if the date changed. Seeded rows use absolute timestamps anchored on `daily[last].date` (for example `D 00:00:00Z` or `D-1 23:59:59.999999Z`), never offsets from the current time."

### F-17. R-STATS-3: "through now" conflicts with calendar-date bucketing for clicks later today
- **IDs:** R-STATS-3, R-STATS-2, R-STATS-4 · **Type:** C, G
- **Problem:** Take a click dated later today than "now" (seeded at `today 23:00` while it's 10:00, or produced by skew between the app clock and the database clock). "The window includes clicks … through now" excludes it. "Counts toward the UTC calendar date of T" plus "the last entry is today" include it. So `daily[today]` and `rangeClicks` differ between implementations. It's also unclear whether future-dated clicks count toward `totalClicks` and `lastClickedAt`.
- **Proposed wording:** "The window is `[00:00:00 UTC of the first day, 00:00:00 UTC of the day after today)`. Clicks later today than 'now' are inside it. Clicks dated after today are outside the window but still count toward `totalClicks`, `clickCount` and `lastClickedAt`."

### F-18. R-REDIR-4: the 2-second window and "exactly one"
- **IDs:** R-REDIR-4 · **Type:** F, A
- **Problem:**
  - Proving "exactly one" means waiting until a duplicate could no longer appear, but no time bound is given.
  - A test that stops polling at the first visible click can't detect a duplicate.
  - A test that checks at exactly 2.0 s races an implementation that flushes every 2 s.
  - The 2-second clock could start when the server sends the response or when the client receives it.
- **Proposed wording:** "Each redirect records exactly one click. The click is visible in `clickCount`, `lastClickedAt` and stats (default `days`) for any request sent 2 s or more after the client receives the redirect response headers. No further clicks from that redirect appear later." In harness guidance: "Poll until the click is visible, and fail if it isn't by 2 s plus 0.5 s grace. Then re-read at 4 s or later and assert the value hasn't changed."

### F-19. R-REDIR-5 has no deadline, no definition of "simultaneous" and no response requirement
- **IDs:** R-REDIR-5 · **Type:** A, F
- **Problem:** The spec doesn't say when `clickCount` is read. Reading immediately fails an async implementation, while reading after 2 s follows R-REDIR-4. It doesn't say whether every response must be 302: if 20 come back as 503 from pool exhaustion, should the count rise by 480 or 500? Client concurrency is undefined too (500 sockets vs a keep-alive pool of 10).
- **Proposed wording:** "The harness sends N=500 `GET /{code}` requests with at least 100 in flight at once, against a link no other test uses. Every response is 302. `clickCount` read 2 s or more after the last response equals the starting value + 500, and is unchanged at 4 s."

### F-20. R-ALIAS-5 leaves N and the request shape unspecified
- **IDs:** R-ALIAS-5 · **Type:** A
- **Problem:** At N=2 a race rarely happens, while N=200 can exhaust connection pools and produce 5xx. The spec doesn't say whether the requests carry the same URL, or which URL ends up stored.
- **Proposed wording:** "N=20 requests are released together behind a barrier. Each uses the same new alias and a distinct `url`. Exactly one gets 201 and 19 get 409 `alias_taken`. No other status appears. Afterwards, `GET /api/links/{alias}` returns the `url` from the request that got 201."

### F-21. R-CLICK-1 leaves referrer normalization details open
- **IDs:** R-CLICK-1 · **Type:** A, G
- **Problem:**
  - **Order.** For `https://WWW.Example.com/`, lowercasing then stripping gives `example.com`. Stripping a case-sensitive `www.` then lowercasing gives `www.example.com`.
  - **Port.** `https://example.com:8443/` could become `example.com` or `example.com:8443`.
  - **What "unparseable" means.** `example.com/page` (no scheme), `android-app://com.slack/`, `about:blank`, `file:///x` and an empty header value could each be `direct` or a host.
  - **IDN.** `https://Bücher.example/` could become `xn--bcher-kva.example` or `bücher.example`.
  - **Edge hosts.** A host of exactly `www.` is empty after stripping. A host of `www` has no dot. `http://direct/` collides with the `direct` bucket.
- **Proposed wording:** "Parse `Referer` with the WHATWG parser (F-06). If parsing fails, the scheme isn't `http` or `https`, or the host is empty, report `direct`. Otherwise take the parsed hostname, which is already lowercased and IDNA-encoded and excludes the port. Then remove one leading `www.` if something remains after it. Examples: `https://WWW.Example.com:8443/x` → `example.com`. `https://www.www.a.io/` → `www.a.io`. `example.com/page` → `direct`. `android-app://com.slack/` → `direct`."

### F-22. R-CLICK-2: whitespace, repeated headers, and codes that aren't ISO
- **IDs:** R-CLICK-2, openapi `LinkStats.topCountries` · **Type:** A, C
- **Problem:**
  - For `cf-ipcountry:  us ` (surrounding whitespace), impl A reports `unknown` and impl B trims and reports `US`.
  - If the header appears twice, it's unclear whether it's joined into `US, GB` (giving `unknown`) or the first value is used.
  - `XX` (Cloudflare's "unknown") is two ASCII letters, so SPEC reports it as `XX`. The openapi description says the name is "an ISO 3166-1 alpha-2 code, or 'unknown'", and `XX`, `ZZ` and `AA` aren't assigned codes.
- **Proposed wording:** "Read the header (name matched case-insensitively) and trim surrounding spaces and tabs. If it appears more than once, report `unknown`. If the value is exactly two ASCII letters, report it uppercased, with no check against ISO 3166-1, so `xx` becomes `XX`. Otherwise report `unknown`." Change the openapi description to: "two uppercase ASCII letters (not validated against ISO 3166-1), or 'unknown'."

### F-23. R-CLICK-3: an empty User-Agent is different from a missing one
- **IDs:** R-CLICK-3 · **Type:** A
- **Problem:** For `User-Agent:` with an empty or whitespace-only value, impl A reads "No User-Agent" and reports `unknown`, while impl B falls through to `desktop`. Note also that HTTP clients send default user agents (undici, python-requests and others), so tests must set one explicitly.
- **Proposed wording:** "If the `User-Agent` header is absent, or its value is empty or only whitespace, report `unknown`."

### F-24. R-URL-1: which whitespace is trimmed, and what about whitespace inside the URL
- **IDs:** R-URL-1, R-URL-2 · **Type:** A
- **Problem:** JS `trim()` strips U+00A0, U+FEFF and U+3000. Go's `TrimSpace` doesn't strip U+FEFF. The WHATWG parser strips C0 controls at the ends and removes tab, LF and CR anywhere.
  - `" https://example.com/"` gets 201 from impl A and 422 from impl B.
  - `"https://exa\nmple.com/"` becomes `https://example.com/` under WHATWG, and is a 422 under parsers that reject it.
- **Proposed wording:** "Only leading and trailing ASCII whitespace (U+0009, U+000A, U+000C, U+000D, U+0020) is trimmed. Everything else goes to the WHATWG parser unchanged and follows its rules (it removes internal tab, LF and CR)."

### F-25. R-URL-3 doesn't define the unit of "characters"
- **IDs:** R-URL-3 · **Type:** A
- **Problem:** Length could be measured in code points (JSON Schema `maxLength`), UTF-16 code units (JS `.length`) or UTF-8 bytes (Go `len`). A URL with 2044 ASCII characters plus 4 emoji is 2048 code points, 2052 UTF-16 units and 2060 bytes. It's also unclear whether length is measured before or after normalization, which can expand the URL: `é` becomes `%C3%A9`, and a trailing `/` gets added.
- **Proposed wording:** "Length is the number of Unicode code points in the trimmed input, measured before parsing. A normalized URL longer than 2048 is still accepted and stored."

### F-26. Is `alias` trimmed?
- **IDs:** R-LINK-3, R-ALIAS-1 · **Type:** A
- **Problem:** For `{"alias":" launch "}`, impl A trims and returns 201 with `launch`, while impl B returns 422 `invalid_alias`. For `{"alias":"   "}`, it could mean no alias or `invalid_alias`.
- **Proposed wording:** "`alias` is never trimmed. Only an omitted alias, `null` and exactly `""` mean no alias. `"   "` → 422 `invalid_alias`."

### F-27. The boundaries of "malformed body" aren't drawn
- **IDs:** R-ERR-2 · **Type:** A, G
- **Problem:**
  - `{"url":""}` and `{"url":"   "}` could count as missing `url` (400) or as an invalid URL (422).
  - A non-object JSON body (`[]`, `"x"`, `null`) isn't covered.
  - A missing or `text/plain` `Content-Type` on a valid JSON body could get 201, 400 or 415, and 415 isn't documented.
  - An empty body isn't covered.
  - An oversized body could get 413, which isn't documented.
- **Proposed wording:** "Malformed body → 400 `bad_request` covers: invalid JSON, an empty body, a top-level value that isn't an object, `url` absent or not a string (including `null`), `alias` present but neither a string nor `null`, and a body over 64 KiB. A string `url`, including `""` or only whitespace, goes on to R-URL (→ 422). `Content-Type` is ignored and the body is always parsed as JSON."

### F-28. "Every 4xx/5xx **JSON** response" lets errors avoid JSON
- **IDs:** R-ERR-1, R-ERR-5 · **Type:** A, G
- **Problem:** The qualifier means an HTML 404 for `GET /api/nope`, a `text/plain` 405 for `PUT /api/links` or a framework's 500 page all comply, because the rule never applies to them. The spec also doesn't say what `GET /api` returns. It matches `/{code}` with the reserved code `api`, so it might be a `text/plain` 404, or a JSON one.
- **Proposed wording:** "Every 4xx/5xx response from `/healthz` or any path under `/api/` has `Content-Type: application/json` and the ErrorResponse body. The only non-JSON error is the `text/plain` 404 from `GET /{code}`, which covers `GET /api` and `GET /api/`. Unrouted paths under `/api/` → 404 `not_found`. A known path with an unsupported method → 405 with an `Allow` header and code `bad_request`." Document the 405 in openapi.json, or add a `method_not_allowed` enum value.

### F-29. `HEAD` and other methods on `/{code}`
- **IDs:** R-REDIR-1, R-REDIR-4 (new) · **Type:** G
- **Problem:** For `HEAD /aZ3kQ9x`, impl A (framework routes HEAD to the GET handler) returns 302 and records a click. Impl B returns 302 without recording one. Impl C returns 405. Link-preview services and uptime checkers send HEAD, so click counts diverge. `POST /aZ3kQ9x` could get 405 or 404.
- **Proposed wording:** "`HEAD /{code}` returns the same status and headers as `GET` and records no click. Other methods on `/{code}` → 405 `text/plain`."

### F-30. Trailing slashes and query strings
- **IDs:** R-REDIR-1, R-REDIR-3, R-ERR-5 (new) · **Type:** G
- **Problem:**
  - `GET /aZ3kQ9x/` could get 404, a 301 to `/aZ3kQ9x`, or a 302 to the destination from a lenient router.
  - For `GET /aZ3kQ9x?utm_source=x`, `Location` could be exactly the stored URL, or the stored URL with the query appended.
  - `GET /api/links/` could return the list or a 404.
- **Proposed wording:** "Paths match exactly. A trailing slash makes a different path: `/{code}/` → 404 `text/plain`, and `/api/links/` or `/api/links/{code}/` → 404 `not_found`. The query string of a redirect request is ignored: `Location` is always exactly the stored URL, and exactly one click is recorded."

### F-31. R-UI-2: what counts as "no scheme"
- **IDs:** R-UI-2 · **Type:** A
- **Problem:**
  - For `HTTP://example.com`, a case-sensitive `^https?://` check adds a prefix, giving `https://HTTP://example.com`, which is *valid* under WHATWG (host `http`). The link points at `https://http//example.com`. A case-insensitive check sends the value unchanged and gets `http://example.com/`.
  - For `  example.com` (leading spaces), impl A adds the prefix first, producing `https://  example.com`, which the API rejects. Impl B trims first and succeeds.
  - `localhost:3000/x` parses under WHATWG as having the scheme `localhost:`.
  - `//example.com` isn't covered.
- **Proposed wording:** "The UI trims ASCII whitespace from the value. If the trimmed value doesn't match `^[A-Za-z][A-Za-z0-9+.-]*://`, the UI prefixes `https://`. Otherwise it sends the value unchanged. Examples: `example.com` → `https://example.com`. `HTTP://x.com` is unchanged. `localhost:3000/x` → `https://localhost:3000/x`. `//x.com` → `https:////x.com`. `javascript:alert(1)` → `https://javascript:alert(1)` (→ `invalid_url`)."

### F-32. UI empty submit and native constraint validation
- **IDs:** R-UI-1, R-UI-2, R-UI-4 · **Type:** G
- **Problem:** With `<input type="url" required>`, the browser blocks `example.com` and shows a native bubble, which defeats R-UI-2. On an empty submit, impl A shows a native "Please fill out this field" (no `alert` role). Impl B sends `https://`, gets a 422 and shows "Enter a valid http or https URL." Impl C shows a client-side alert.
- **Proposed wording:** "The form uses no browser constraint validation (`novalidate`, and no `type=url` or `required`). Submitting an empty or whitespace-only destination shows `role=alert` with the `invalid_url` message and sends no API request."

### F-33. R-UI-5: which links appear, how many, and when the table refreshes
- **IDs:** R-UI-5 · **Type:** G, F
- **Problem:** The database is shared and unbounded, yet the spec doesn't say whether the table shows the first 20 links, all of them, or pages through them. It doesn't say whether the new row appears after "Shorten" without a reload. Impl A refreshes and impl B doesn't, so a test that creates a link and then looks for "Delete {code}" disagrees. Cell contents are also undefined: whether "Short link" holds the full `shortUrl` or the code, the "Created" format, and the number format in "Clicks".
- **Proposed wording:** "The table shows the 20 newest links (`limit=20&offset=0`) and is re-fetched after every successful create or delete, without a full page reload. 'Short link' contains a link whose name and `href` are `shortUrl`. 'Destination' is `url`. 'Clicks' is `clickCount` as a plain integer. 'Created' is `createdAt` in UTC, formatted `YYYY-MM-DD HH:MM`." Alternatively: "The harness doesn't assert cell formats."

### F-34. R-UI-6: "Confirm delete" isn't unique and has no defined placement
- **IDs:** R-UI-6 · **Type:** A
- **Problem:** Reveal confirmation on two rows and two buttons named "Confirm delete" exist, so a strict role selector fails. If the confirmation is rendered outside the row (a banner or a custom modal), a test that scopes to the row fails. The spec doesn't say whether opening a second confirmation closes the first, or whether a cancel option exists.
- **Proposed wording:** "Clicking 'Delete {code}' reveals a button named 'Confirm delete' inside the same table row. At most one is open at a time: opening another closes the first. After confirmation, the row is gone within 2 s and `GET /api/links/{code}` returns 404."

### F-35. R-UI-7: formats, row order and empty states
- **IDs:** R-UI-7 · **Type:** A
- **Problem:**
  - The Date column could be `2026-10-17`, `Oct 17, 2026` or a local-time date.
  - Row order could be oldest-first or newest-first.
  - It's unclear whether "one row per day" counts the header row. Role-based row queries include it.
  - An empty breakdown table could have zero rows or a single "No data" row, which would read as a referrer named "No data".
  - "Total clicks: N" could be written as `1,234` or `1234`.
- **Proposed wording:** "Dates are `YYYY-MM-DD` (UTC), with rows oldest first. Each table has exactly one header row plus one row per API entry. An empty breakdown has no body rows, and any 'no data' message sits outside the table. N is a base-10 integer without separators."

### F-36. R-UI-8: the default and non-standard `days`
- **IDs:** R-UI-8, R-UI-7 · **Type:** G
- **Problem:** With no `?days` on `/links/{code}`, "30 days" might carry `aria-current` or nothing might. The spec doesn't cover `?days=14`, or `?days=0`, `abc` or `400`, where the API returns 400 and the UI might render an error page, a 404 or a 500.
- **Proposed wording:** "Without `days`, the page uses 30 and '30 days' has `aria-current="page"`. Any integer from 1 to 365 is honored, and if it isn't 7, 30 or 90, no link is current. An invalid `days` value renders the page as if `days=30`."

### F-37. R-STATS-5: "name ascending" depends on collation
- **IDs:** R-STATS-5, R-STATS-6 · **Type:** A
- **Problem:** Postgres `ORDER BY name` uses the database collation, often `en_US.UTF-8`, which ignores punctuation at the first comparison level. Under `C` collation, `a-c.com` sorts before `ab.com` because `-` (0x2D) < `b`. Under `en_US`, `ab.com` sorts first. JS `localeCompare` and `<` also differ.
- **Proposed wording:** "…then by name ascending in Unicode code-point order (equivalent to `COLLATE "C"` on UTF-8)."

### F-38. R-ERR-4 can't be tested as written
- **IDs:** R-ERR-4 · **Type:** U
- **Problem:** The list is unbounded, "internal type names" isn't defined, and triggering 5xx paths needs fault injection. Two harnesses would check different things.
- **Proposed wording:** "Every error `message` the harness observes must not match any of these patterns: `(?i)\b(select|insert|update|delete)\b.+\b(from|into|set|where)\b`, `(?i)(traceback|exception|panic:|goroutine|sqlstate)`, `(/Users/|/home/|/usr/|/var/|/app/|[A-Z]:\\)`, `\.(js|ts|py|go|rs|java|rb):\d+`. Every 500 body is exactly `{"error":{"code":"internal","message":"Internal server error."}}`. *(The 5xx path is verified by a mutant.)*"

### F-39. R-PRIV-1 says "never stored" but checks only the schema
- **IDs:** R-PRIV-1 · **Type:** U
- **Problem:** "Never stored" covers application logs and files, but the stated check only inspects the schema. An implementation that logs IPs passes the check and still violates the rule's wording.
- **Proposed wording:** Either "Client IP addresses are never stored **in the database** *(gray-box: schema inspection)*", or extend it: "…and never written to logs *(gray-box: the harness greps api stdout/stderr for the test client's IP)*."

### F-40. Several gray-box rules aren't labeled where they're stated
- **IDs:** R-STATS-2, R-STATS-3, R-ALIAS-5, R-REDIR-5 · **Type:** U
- **Problem:** The Data model section says that R-STATS-2/3 need seeding, but the rule rows don't carry the gray-box label that R-REDIR-6 and R-PRIV-1 carry. The report has one row per ID, so it's unclear whether a black-box-only harness counts them as verified. R-ALIAS-5 and R-REDIR-5 are probabilistic: a pass doesn't show the race was exercised.
- **Proposed wording:** Add "*(Gray-box: seeded rows, see Data model.)*" to R-STATS-2 and R-STATS-3. Add "*(Probabilistic. Paired with a mutant that removes the uniqueness constraint or the atomic increment.)*" to R-ALIAS-5 and R-REDIR-5.

---

## Minor

### F-41. Generated codes vs reserved words and existing aliases
- **IDs:** R-LINK-1, R-LINK-6 · **Type:** G
- **Problem:** A generated code could equal `healthz` in any casing (7 characters), which `/healthz` would shadow, or an existing 7-character alias, which could produce a 409 or 5xx on a no-alias request.
- **Proposed wording:** "Generated codes never equal an existing code and never match a reserved alias case-insensitively. On a collision the server regenerates. A request without an alias never returns 409."

### F-42. A trailing slash or path in `PUBLIC_BASE_URL`
- **IDs:** R-LINK-4, Configuration · **Type:** G
- **Problem:** `PUBLIC_BASE_URL=http://localhost:8080/` would make R-LINK-4 produce `http://localhost:8080//abc`.
- **Proposed wording:** "`PUBLIC_BASE_URL` is an origin with no trailing slash or path."

### F-43. `CORS_ALLOWED_ORIGIN` is configured but no rule covers it
- **IDs:** Configuration · **Type:** G
- **Problem:** No requirement says how CORS behaves, so the setting can't be tested and implementations will differ.
- **Proposed wording:** Add "R-CORS-1: responses under `/api/` to a request with `Origin: <CORS_ALLOWED_ORIGIN>` include `Access-Control-Allow-Origin: <that origin>`. Other origins get no ACAO header." Or remove the variable.

### F-44. Non-default configuration can't be exercised
- **IDs:** R-CLICK-2, R-URL-4 · **Type:** U
- **Problem:** A non-default `COUNTRY_HEADER` or `PUBLIC_BASE_URL` requires restarting the api, which the harness can't do over HTTP.
- **Proposed wording:** "The harness tests only default configuration values." Alternatively: "The harness restarts the api with an alternate env in a dedicated phase."

### F-45. R-REDIR-2: exact header value or directive?
- **IDs:** R-REDIR-2 · **Type:** A
- **Problem:** It's unclear whether `Cache-Control: no-store, private` passes.
- **Proposed wording:** "`Cache-Control` contains the `no-store` directive. Other directives may also appear."

### F-46. R-REDIR-3: media-type parameters and body
- **IDs:** R-REDIR-3 · **Type:** A
- **Problem:** It's unclear whether `text/plain; charset=utf-8` passes, and the body content isn't specified.
- **Proposed wording:** "The media type is `text/plain`, and parameters such as `charset` are allowed. The body is non-empty, and its content is not part of the contract."

### F-47. Timestamp format and precision
- **IDs:** R-LINK-5, R-GET-1, openapi `Link` · **Type:** A, F
- **Problem:** The timestamp could end in `Z` or `+00:00`, and fractional seconds may or may not appear. It's unclear whether `lastClickedAt` must equal a seeded `clicked_at` to the microsecond. Assertions like "`createdAt` ≈ harness now" depend on clock skew.
- **Proposed wording:** "Timestamps are RFC 3339 in UTC with `Z`, with optional fractional seconds of up to 6 digits. `lastClickedAt` equals `max(clicked_at)` at full stored precision. Tests compare server timestamps only with other server timestamps, or use a tolerance of 5 s or more."

### F-48. R-UI-10: axe version, pages and states
- **IDs:** R-UI-10 · **Type:** A
- **Problem:** "Every page" doesn't list the pages or their states, such as with the alert shown or the confirmation revealed. Axe rule sets also change between versions.
- **Proposed wording:** "axe-core `<exact version>` with default rules reports zero `serious` or `critical` violations on `/` (empty form, after a success, after an error, with the confirmation revealed), on `/links/{code}` for each `days` link, and on `/links/{unknown}`."

### F-49. R-UI-4: exact strings and the match mode
- **IDs:** R-UI-4 · **Type:** A
- **Problem:** The `invalid_alias` message contains an en dash (U+2013, `3–32`) that implementers may type as a hyphen. The spec doesn't say whether matching is exact or by substring.
- **Proposed wording:** "The alert's text content, trimmed, equals the message exactly. Note that `3–32` uses U+2013."

### F-50. The "Copy short link" button has no specified behavior
- **IDs:** R-UI-3 · **Type:** G
- **Proposed wording:** "Activating it writes `shortUrl` to the clipboard *(not verified, presence only)*." Or specify a visible confirmation, such as `role=status` text "Copied".

### F-51. The rule that the browser never calls `/api/*` has no ID
- **IDs:** new (from "The system") · **Type:** U
- **Problem:** "The browser never calls `/api/*`" reads as a requirement, but it has no ID, so it will never be verified or reported.
- **Proposed wording:** Give it an ID ("R-UI-11: during all UI tests, the browser issues no request to any `/api/` path. Checked by network capture."), or mark it as informative.

### F-52. Stats echo fields aren't specified
- **IDs:** R-STATS-1, openapi `LinkStats` · **Type:** G
- **Proposed wording:** "`code` and `days` in the stats response echo the path code and the `days` in effect."

### F-53. R-STATS-4: is `totalClicks` the same number as `clickCount`?
- **IDs:** R-STATS-4, R-GET-1 · **Type:** A
- **Proposed wording:** "`totalClicks` equals `GET /api/links/{code}`'s `clickCount` when both are read without intervening clicks."

### F-54. Days before the link existed, and `days=1` for a link created today
- **IDs:** R-STATS-2 · **Type:** G
- **Problem:** An implementation might start `daily` at `createdAt`.
- **Proposed wording:** Add normative examples: "For a link created today, `days=1` returns one entry (today), and `days=30` returns 30 entries, 29 of them zero. Entries are never truncated to `createdAt`."

### F-55. R-STATS-6 and R-STATS-5: entries with zero clicks and the special names
- **IDs:** R-STATS-5, R-STATS-6 · **Type:** A
- **Proposed wording:** "`devices` lists only classes with at least 1 click in the window. `direct` and `unknown` are ordinary entries that compete for the top 5."

### F-56. The openapi version doesn't match the spec tag; R-DEL-1's "every route" scope
- **IDs:** R-DEL-1, openapi `info.version` · **Type:** A
- **Problem:** `info.version` is `0.1.0`, while the frozen spec will be tagged `spec-v1`. It's unclear whether "404s on every route" in R-DEL-1 includes the UI route `/links/{code}`.
- **Proposed wording:** Set `info.version` to `1.0.0` when the spec is tagged. In R-DEL-1, list the routes: "`GET`/`DELETE /api/links/{code}`, `GET /api/links/{code}/stats`, `GET /{code}` and the UI page `/links/{code}` (R-UI-9)."
