# Shortlink spec (system under test)

**Status: SIGNED OFF by Matthew Nelson on 2026-10-17. Frozen at tag `spec-v1`.** Revised after two blind adversarial reviews by different models: #1 Opus (`spec/reviews/01-*`) and #2 Fable (`spec/reviews/02-*`), each with a disposition file accounting for every finding. When signed off, this file is frozen and tagged `spec-v1`. Changes after that go through `spec/PROPOSALS.md` and need a new tag.

This is the single statement of intent that everything else answers to. The harness tests it, the implementations build to it, and the mutants violate it. Field-level request and response shapes are in `spec/openapi.json`. This file covers the rules a schema can't express, and where the two seem to differ, **this file wins**.

Each rule has an ID (`R-AREA-n`). IDs are never renumbered. Every test names the ID(s) it checks, every mutant names the ID it breaks, and the verification report has one row per ID. Labels after a rule say how it is verified when that isn't plain black-box HTTP or browser testing:
- *(gray-box)*: the harness reads or seeds the database, or reads api logs, using the contracts in this file.
- *(mutant-verified)*: the behavior can only be shown by breaking it deliberately.
- *(probabilistic)*: a pass shows the race wasn't observed, not that it can't happen. Always paired with a mutant.
- *(unverifiable)*: no available test or mutant can show it. Kept because it states intent, and always reported as **unverified**, never as passing.

## The system

A URL shortener with click analytics. A user submits a long URL, optionally with an alias, and gets a short link. Visiting the short link redirects and records a click. A minimal web UI creates and deletes links and shows per-link stats.

```
browser ──► web UI (:3000) ──server-side──► api (:8080) ──► Postgres
   └────────── GET /{code} (short link) ──────┘
```

Short URLs point at the api (`PUBLIC_BASE_URL`). The web UI calls the api only from its server (R-UI-11).

## Shared definitions

- **URL parsing.** Every URL in this spec is parsed with the **WHATWG URL Standard** basic URL parser, with no base URL. "Hostname" means the parser's `hostname`: lowercased, IDNA/punycode-encoded and without the port. "Serialized" means the parser's `href`.
- **ASCII whitespace.** U+0009, U+000A, U+000C, U+000D and U+0020. Nothing else.
- **Regular expressions.** Every regex in this spec must match the **entire** string, with `\A…\z` semantics, so a trailing newline doesn't match `$`. `"abc\n"` is not a valid alias.
- **Query integer.** A query parameter value that, after percent-decoding (`+` is a literal plus, not a space), matches `^(0|[1-9][0-9]*)$` and appears at most once. Empty values, signs, decimals, exponents, leading zeros, repeated parameters and values too large for a 64-bit signed integer are **not** query integers. Parameters an endpoint doesn't define are ignored.
- **Timestamps.** Timestamps are RFC 3339 in UTC with the `Z` suffix, with optional fractional seconds of at most 6 digits.
- **Clock.** "Now" and "today" are taken from the **database clock** (`now()` at UTC) when the request runs.
- **Name order.** "Name ascending" means Unicode code-point order, equivalent to `COLLATE "C"`.

---

## API requirements

### Creating links: `POST /api/links`

| ID | Rule |
|---|---|
| R-LINK-1 | A valid request with no alias returns **201** and a `Link` whose `code` is exactly 7 characters from `[A-Za-z0-9]` and whose `isCustom` is `false`. |
| R-LINK-2 | A valid request with an alias returns **201** with `code` equal to the alias, exactly as sent, and `isCustom` `true`. |
| R-LINK-3 | An `alias` that is omitted, `null` or exactly `""` is treated as no alias (R-LINK-1). The alias is never trimmed. `"   "` is an alias and fails R-ALIAS-1. |
| R-LINK-4 | `shortUrl` equals `PUBLIC_BASE_URL + "/" + code`. `PUBLIC_BASE_URL` is an origin with no path and no trailing slash. |
| R-LINK-5 | A new link has `clickCount` 0 and `lastClickedAt` `null`. |
| R-LINK-6 | Generated codes are unique. 1,000 sequential creates with no alias produce 1,000 distinct codes. |
| R-LINK-7 | A request with no alias never returns 409. Generated codes never equal an existing code and never match a reserved alias case-insensitively; on a collision the server regenerates. *(The first sentence is black-box. The collision clause is unverifiable, because a 62⁷ code space can't be forced to collide without a test backdoor, which v1 deliberately doesn't add.)* |
| R-LINK-8 | Unknown fields in the request body are ignored. |

### URL validation

| ID | Rule |
|---|---|
| R-URL-1 | Leading and trailing ASCII whitespace in `url` is trimmed. The result is passed to the WHATWG parser unchanged; the parser itself removes internal tab, LF and CR. |
| R-URL-2 | A URL is valid if and only if parsing succeeds, the scheme is `http` or `https`, and the hostname is non-empty. Otherwise → **422** `invalid_url`. That includes `""` and whitespace-only strings. |
| R-URL-3 | The trimmed input may be at most 2048 Unicode code points, measured **before** parsing. Longer → **422** `invalid_url`. Exactly 2048 is accepted, even if the normalized form is longer. |
| R-URL-4 | A URL whose hostname equals the hostname of `PUBLIC_BASE_URL` → **422** `invalid_url`. Ports are ignored, and no DNS or IP equivalence applies: `127.0.0.1` is not `localhost`. |
| R-URL-5 | The stored URL, the returned `url` and the redirect `Location` are the parser's serialization, byte for byte. Normative examples are below. |

**R-URL-5 normative examples:**

| Input | Result |
|---|---|
| `https://example.com` | `https://example.com/` |
| `HTTPS://Example.COM:443/a/../b` | `https://example.com/b` |
| `https://bücher.example/ä` | `https://xn--bcher-kva.example/%C3%A4` |
| `https://example.com/a b` | `https://example.com/a%20b` |
| `http:example.com` | `http://example.com/` |
| `http:///example.com` | `http://example.com/` |
| `https://example.com\path` | `https://example.com/path` |
| `"  https://example.com/x  "` | `https://example.com/x` |
| `javascript:alert(1)`, `ftp://example.com/`, `/relative`, `example.com` | 422 `invalid_url` |

### Alias validation

| ID | Rule |
|---|---|
| R-ALIAS-1 | An alias must match `^[A-Za-z0-9_-]{3,32}$`. Otherwise → **422** `invalid_alias`. |
| R-ALIAS-2 | Reserved aliases → **422** `alias_reserved`, compared case-insensitively: `api`, `healthz`, `docs`, `admin`, `static`, `assets`, `login`, `logout`. (Paths like `favicon.ico`, `robots.txt` and `openapi.json` also can't be aliases, but R-ALIAS-1 rejects them first with `invalid_alias`.) |
| R-ALIAS-3 | An alias already in use → **409** `alias_taken`. |
| R-ALIAS-4 | Codes are case-sensitive. `Launch` and `launch` are different links. |
| R-ALIAS-5 | When N=20 requests with the same new alias and 20 distinct `url` values are released together, exactly one gets 201 and 19 get 409 `alias_taken`, with no other status. Afterwards, `GET /api/links/{alias}` returns the `url` from the request that got 201. *(probabilistic; paired with a mutant that removes the uniqueness guarantee)* |

### Errors

| ID | Rule |
|---|---|
| R-ERR-1 | Every 4xx/5xx response from `/healthz` or any path of the form `/api/<non-empty remainder>` has `Content-Type: application/json` and the body `{"error":{"code","message"}}`, with `code` from the enum in `openapi.json`. The only non-JSON errors are on `/{code}` (R-REDIR-3, R-REDIR-9). |
| R-ERR-2 | Precedence for `POST /api/links`, where the first failing rule wins: (1) **400** `bad_request` for a malformed body: invalid JSON, an empty body, a top-level value that isn't an object, `url` absent or not a string (including `null`), `alias` present but neither a string nor `null`, or a body larger than 64 KiB; (2) R-URL; (3) R-ALIAS-1; (4) R-ALIAS-2; (5) R-ALIAS-3. Checks on string content (length, pattern, URL syntax, reserved, taken) are never 400. `Content-Type` is ignored and the body is always parsed as JSON. A body that isn't valid UTF-8, or contains an unpaired surrogate escape, is malformed. With duplicate keys, the last value wins. |
| R-ERR-3 | `limit` and `offset` are validated only on `GET /api/links`, and `days` only on `GET /api/links/{code}/stats`. There, when present, each must be a query integer within its range (R-LIST-1, R-STATS-1). Otherwise → **400** `bad_request`, never 5xx. Nothing is clamped. On other endpoints these are undefined parameters and are ignored. |
| R-ERR-4 | Error messages never include request-supplied values (codes, aliases, URLs or header values), and no error `message` matches any of these case-insensitive patterns: `\b(select|insert|update|delete)\b.+\b(from|into|set|where)\b`, `(traceback|exception|panic|goroutine|sqlstate|stack)`, `(/Users/|/home/|/usr/|/var/|/app/|[A-Z]:\\)`, `\.(js|ts|py|go|rs|java|rb):\d+`. |
| R-ERR-5 | On `/api/links/{code}*`, a code that doesn't identify an existing link, including values no code could have, → **404** `not_found`. Query validation (R-ERR-3) runs **before** the code lookup. Path segments are percent-decoded once before lookup. |
| R-ERR-6 | Checks run in this order on every path: (1) exact route match, where an unmatched path is a 404 regardless of method (`/api/<…>` → `not_found` JSON; anything else → `text/plain`); (2) method, where an unsupported method on a matched route → **405** regardless of whether the code exists (`method_not_allowed` JSON under `/api/` and `/healthz`; `text/plain` on `/{code}`); (3) query validation (R-ERR-3); (4) code lookup (R-ERR-5). Every 405 has an `Allow` header whose comma-separated set of methods is exactly the supported set (tests compare sets, not strings). So `PUT /api/links/{anything}` → 405 and `POST /{code}/` → 404. |
| R-ERR-7 | Every 500 response body is exactly `{"error":{"code":"internal","message":"Internal server error."}}`. *(mutant-verified)* |
| R-ERR-8 | `HEAD` on `/healthz` and on every `GET` route under `/api/` returns the `GET` route's status and `Content-Type`, with no body. It isn't an unsupported method, and those routes' `Allow` sets include `HEAD`. `OPTIONS` is unsupported everywhere → 405. |

### Reading and deleting

| ID | Rule |
|---|---|
| R-LIST-1 | `GET /api/links` orders by `createdAt` descending, then by internal id descending. `limit` is 1–100 (default 20) and `offset` is ≥ 0 (default 0). |
| R-LIST-2 | `total` is the count of all links, ignoring pagination. The response `limit` and `offset` equal the requested values, or the defaults. If `offset` ≥ `total`, the response is 200 with `items: []`. |
| R-GET-1 | `GET /api/links/{code}` returns the `Link`. `clickCount` is the number of click rows for the link, and `lastClickedAt` is the maximum `clicked_at` at full stored precision, or `null` if there are none (R-DATA-1). |
| R-DEL-1 | `DELETE /api/links/{code}` returns **204**. Afterwards the code gets a 404 on `GET` and `DELETE /api/links/{code}`, on `GET /api/links/{code}/stats`, on `GET /{code}`, and on the UI page `/links/{code}` (R-UI-9). |
| R-DEL-2 | After deletion the code can be reused as an alias. |

### Redirect: `GET /{code}`

| ID | Rule |
|---|---|
| R-REDIR-1 | A known code → **302** with `Location` set to the stored URL (R-URL-5). |
| R-REDIR-2 | The redirect's `Cache-Control` header contains the `no-store` directive. Other directives may also appear. |
| R-REDIR-3 | An unknown code (R-ERR-5 semantics) → **404** with media type `text/plain`. Parameters such as `charset` are allowed, and the body is non-empty with unspecified content. `/api` and `/api/` are handled as `/{code}` and `/{code}/`, so both get a `text/plain` 404. |
| R-REDIR-4 | Each `GET` redirect records exactly one click. It's visible in `clickCount`, `lastClickedAt` and stats for any request sent 2 s or more after the client receives the redirect response headers, and no further clicks from that redirect appear later. |
| R-REDIR-5 | 500 `GET /{code}` requests for one link, with at least 100 in flight at once, all get 302. `clickCount` read 2 s or more after the last response equals the starting value + 500, and the same value is read again at 4 s. *(probabilistic; paired with a mutant that loses concurrent clicks)* |
| R-REDIR-6 | A failure to record a click never changes the redirect response or delays it beyond normal latency. *(mutant-verified)* |
| R-REDIR-7 | `HEAD /{code}` returns the same status as `GET`, with the same `Location` and `Cache-Control` values on a 302 and the same `Content-Type` on a 404, and no body. It records **no** click. Other headers are not compared. |
| R-REDIR-8 | The query string of a redirect request is ignored. `Location` is exactly the stored URL, and exactly one click is recorded. |
| R-REDIR-9 | Any method other than `GET` or `HEAD` on `/{code}` → **405** `text/plain`, with an `Allow` set of exactly {`GET`, `HEAD`}. |
| R-ROUTE-1 | Paths match exactly. A trailing slash is a different path: `/{code}/` → 404 `text/plain`, and `/api/links/` or `/api/links/{code}/` → 404 `not_found`. |
| R-ROUTE-2 | The api never redirects to a normalized path. Paths with dot segments, empty segments or malformed percent-escapes are unmatched paths: `/api/<…>` → 404 `not_found`, anything else → 404 `text/plain`. Request URIs over 8 KiB may be rejected by the server with any 4xx and any body, and tests never send them. |
| R-ROUTE-3 | In v1 the api serves nothing at `/` or at any reserved path other than `/healthz`. Those paths get 404 `text/plain`, like any unknown code. |

### What a click records

These describe the values that are **stored**. Normalization happens when the click is written (R-DATA-2).

| ID | Rule |
|---|---|
| R-CLICK-1 | Referrer: the header value is decoded as UTF-8, and invalid bytes make it fail to parse. If the `Referer` header is absent, appears more than once, fails to parse, has a scheme other than `http`/`https`, or has an empty hostname → `direct`. Otherwise use the hostname, and remove one leading `www.` if something remains after it. If the result is exactly `direct`, it's stored as `NULL` (R-DATA-2). Examples: `https://WWW.Example.com:8443/x` → `example.com`; `https://www.www.a.io/` → `www.a.io`; `example.com/page` → `direct`; `android-app://com.slack/` → `direct`. |
| R-CLICK-2 | Country: read the header named by `COUNTRY_HEADER` (name matched case-insensitively) and trim surrounding spaces and tabs. If the header appears more than once → `unknown`. If the value is exactly two ASCII letters, record it uppercased (not checked against ISO 3166-1, so `xx` → `XX`). Otherwise → `unknown`. |
| R-CLICK-3 | Device: if `User-Agent` is absent, empty or whitespace-only → `unknown`. Otherwise the first matching rule wins, case-insensitive: contains `bot`, `crawl`, `spider`, `preview` or `facebookexternalhit` → `bot`; contains `ipad` or `tablet` → `tablet`; contains `mobi`, `iphone` or `android` → `mobile`; anything else → `desktop`. |
| R-PRIV-1 | Client IP addresses are never stored in the database or written to api logs. *(gray-box: schema inspection, plus a search of the api's stdout and stderr lines emitted **after the suite's first request** for the client's address in any textual form, including IPv4-mapped IPv6. Startup lines are excluded. Where possible, the harness client uses an address different from the api's bind address and the database host, and the report records which address was searched for.)* |

### Stats: `GET /api/links/{code}/stats?days=N`

| ID | Rule |
|---|---|
| R-STATS-1 | `days` defaults to 30 and must be 1–365. The response `code` equals the link's stored code (the decoded path segment), and `days` is the value in effect. |
| R-STATS-2 | `daily` has exactly `days` entries, oldest first. The last entry is today, and days with no clicks appear with `clicks: 0`. Entries are never cut off at `createdAt`: a link created today with `days=30` gets 30 entries. *(gray-box: seeded rows)* |
| R-STATS-3 | The window is `[00:00:00Z of the first day, 00:00:00Z of the day after today)`. A click counts toward the UTC date of its `clicked_at`. Clicks outside the window are excluded from everything except `totalClicks`. *(gray-box: seeded rows)* |
| R-STATS-4 | `rangeClicks` equals the sum of `daily[].clicks`. `totalClicks` is the all-time count, equal to `clickCount` from `GET /api/links/{code}` when there are no clicks in between. |
| R-STATS-5 | `topReferrers` and `topCountries` count only clicks in the window. Each has at most 5 entries, sorted by clicks descending, then name ascending. `direct` and `unknown` are ordinary entries. |
| R-STATS-6 | `devices` lists every device class with at least 1 click in the window, in the same sort order. |

### Data contract

| ID | Rule |
|---|---|
| R-DATA-1 | Every click-derived field (`clickCount`, `lastClickedAt`, `totalClicks`, `rangeClicks`, `daily`, `topReferrers`, `topCountries`, `devices`) is computed from the `clicks` rows when the request runs, with no counters, rollups or caches. A row inserted directly into `clicks` appears in every such field on the next request. *(gray-box)* |
| R-DATA-2 | Columns are encoded as follows. `referrer_host` holds the normalized host per R-CLICK-1, or `NULL` for `direct`, and never `''` or `'direct'`. `country` holds two uppercase ASCII letters, or `NULL` for `unknown`. `device` holds one of the five lowercase values. The api reports stored values unchanged, mapping `NULL` to `direct`/`unknown`. *(gray-box)* |
| R-DATA-3 | The implementation's migrations create exactly the schema below. Extra indexes and a migration-bookkeeping table are allowed. Triggers, and columns or tables that duplicate click data or store request data, are not. *(gray-box: schema inspection)* |

### Operations

| ID | Rule |
|---|---|
| R-HEALTH-1 | `GET /healthz` checks the database with a timeout of at most 2 s, and responds within 3 s: 200 `{"status":"ok"}` on success, otherwise 503 with `code` `unavailable`. *(The 503 branch is gray-box: a second api instance is started with `DATABASE_URL` pointing at a harness-owned TCP listener that accepts connections and never responds. That exercises the timeout, not just "connection refused".)* |
| R-HEALTH-2 | The api opens its port and serves `/healthz` even when the database is unreachable at startup. It never exits because a connection or migration attempt failed; it retries, and applies migrations once the database is reachable. The harness waits up to 10 s for the port to open. Other endpoints' behavior while the database is unreachable is unspecified beyond R-ERR-1. |
| R-HEALTH-3 | The health check queries the database on every request, without caching the result. *(mutant-verified)* |
| R-OAS-1 | Every response conforms to `spec/openapi.json` under the Schemathesis run defined in "Verification rules". Any 5xx observed during that run fails this requirement. |

---

## Web UI requirements (minimal)

The UI is verified through its accessible roles and names, the same way a screen-reader user experiences it. The names below are **contract**: the UI must use them exactly, and the harness selects elements by them. Text matches are exact after trimming.

| ID | Rule |
|---|---|
| R-UI-1 | `/` has a form with a textbox labeled **"Destination URL"**, a textbox labeled **"Custom alias (optional)"** and a button named **"Shorten"**. The form uses no browser constraint validation (`novalidate`, no `type="url"`, no `required`). |
| R-UI-2 | The UI trims ASCII whitespace from the destination. If the trimmed value doesn't match `^[A-Za-z][A-Za-z0-9+.-]*://`, it prefixes `https://`; otherwise it sends the value unchanged. So `example.com` creates a link to `https://example.com/`, `HTTP://x.com` is sent unchanged, and `example.com:8443/x` becomes `https://example.com:8443/x`. The UI also trims ASCII whitespace from the alias field, and an alias that's empty after trimming is omitted from the request. (The api itself never trims aliases, per R-LINK-3. Trimming is a UI convenience.) |
| R-UI-3 | On success, an element with role `status` contains a link whose name and `href` are the new `shortUrl`, and a button named **"Copy short link"** that writes `shortUrl` to the clipboard when activated. *(The clipboard is verified in Chromium with clipboard permissions granted, via `navigator.clipboard.readText()`.)* |
| R-UI-4 | On an API error, an element with role `alert` shows exactly the message for that error code from the table below. |
| R-UI-5 | `/` shows a table named **"Your links"** with column headers **Short link**, **Destination**, **Clicks**, **Created**, listing the 20 newest links in API order. The table is always present with exactly one header row; with no links it has no body rows, and any "no links" text is outside the table. It's re-fetched after every successful create or delete, with no full page reload. Each row has a link named **"Stats for {code}"** to `/links/{code}` and a button named **"Delete {code}"**. Cell contents: Short link is a link whose name and `href` are `shortUrl`; Destination is `url`; Clicks is `clickCount` as a plain integer; Created is `createdAt` in UTC as `YYYY-MM-DD HH:MM`, with seconds truncated, not rounded. |
| R-UI-6 | Clicking "Delete {code}" reveals a button named **"Confirm delete"** inside the same row. At most one is open at a time: opening another closes the first. Confirming removes the row within 2 s, and the link is deleted in the api. Nothing is deleted without confirmation, and no native browser dialogs are used. |
| R-UI-7 | `/links/{code}` has a level-1 heading containing the code. It shows the text **"Total clicks: N"** and **"Clicks in range: N"**, where N is a base-10 integer without separators. It has a table named **"Clicks per day"** (columns **Date**, **Clicks**; dates `YYYY-MM-DD` UTC; oldest first; one body row per `daily` entry) and tables named **"Top referrers"**, **"Top countries"** and **"Devices"** (columns **Name**, **Clicks**; one body row per API entry; an empty table has no body rows, and any "no data" text is outside the table). Each table has exactly one header row. |
| R-UI-8 | `/links/{code}` has links named **"7 days"**, **"30 days"** and **"90 days"** that set `?days=`. `days` is valid if and only if it's a query integer from 1 to 365. A valid value is honored, and the matching link, if there is one, has `aria-current="page"`. A missing or invalid `days` behaves exactly like `days=30`, including `aria-current` on "30 days". |
| R-UI-9 | `/links/{unknown}` responds with HTTP 404 and a level-1 heading **"Link not found"**. |
| R-UI-10 | axe-core (version pinned in the harness lockfile, default rules) reports zero `serious` or `critical` violations in these states: `/` with an empty form, after a success, after an error, and with a delete confirmation revealed; `/links/{code}` for each `days` link; and `/links/{unknown}`. |
| R-UI-11 | During all UI tests, the browser sends no request to any `/api/` path. *(checked by network capture)* |
| R-UI-12 | Submitting an empty or whitespace-only destination shows the `invalid_url` message with role `alert`, and the **browser sends no network request**: no fetch, XHR, form post or navigation. It's a client-side check, verified by network capture. |

### Error messages (R-UI-4, R-UI-12)

| `error.code` | Message shown |
|---|---|
| `invalid_url` | Enter a valid http or https URL. |
| `invalid_alias` | Aliases are 3 to 32 letters, numbers, hyphens or underscores. |
| `alias_reserved` | That alias is reserved. Try another. |
| `alias_taken` | That alias is taken. Try another. |
| anything else | Something went wrong. Please try again. |

---

## Data model

Gray-box tests depend on this schema (R-DATA-1..3):

```sql
links  (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, code TEXT UNIQUE NOT NULL, url TEXT NOT NULL,
        is_custom BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now())
clicks (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        link_id BIGINT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
        clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(), referrer_host TEXT, country CHAR(2),
        device TEXT NOT NULL CHECK (device IN ('desktop','mobile','tablet','bot','unknown')))
INDEX ON clicks (link_id, clicked_at)
```

The harness never supplies `id` values. It may insert `links` rows with an explicit `created_at`, and `clicks` rows with any `clicked_at`, using only R-DATA-2 encodings.

## Verification rules (binding on the harness)

These rules keep the tests deterministic against a shared, live system.

- **Shared database.** The database isn't assumed empty, and the harness never truncates during a run. Tests don't assert absolute `total` values or absolute list positions. They assert the relative order of their own links, and that `total` has grown by at least the number of links they created. Every alias a test uses includes a unique random suffix.
- **Scheduling.** The UI suites and the R-LINK-6 bulk-create test never run concurrently with each other or with list-order tests. A list-order test fetches with `limit=100` and pages forward until it has found all of its own links (bounded by `total` at the first call) before asserting their relative order. A UI test whose link no longer appears in "Your links" re-creates it, at most once.
- **Time.** Tests take "today" from `daily[last].date` or from the database `now()`, never from the harness clock. Seeded timestamps are absolute and anchored to that date (for example `D 00:00:00Z`, or `D-1 23:59:59.999999Z`), never offsets from the current time. Any test anchored to a date re-reads "today" after its assertions, and if it changed, retries once from the start.
- **Timestamps** are compared as instants after parsing, never as strings.
- **Eventual visibility (R-REDIR-4).** Poll until the click is visible, and fail if it isn't by 2.5 s. Then read again at 4 s or later and assert nothing changed.
- **Client headers.** Tests set `User-Agent` explicitly, because HTTP clients send their own defaults.
- **Fuzzing (R-OAS-1).** Schemathesis, version pinned in the harness lockfile, runs every check that version provides **except `positive_data_acceptance`**. That check is excluded because R-ERR-2 deliberately keeps content rules out of the schema, so schema-valid requests legitimately get 422. It runs in positive and negative modes, with a fixed seed recorded in the report and at least 100 examples per operation. It does not follow redirects. Format validation is off for URL-valued fields, because WHATWG serialization isn't always RFC 3986. Generated path values are bounded by the `Code` parameter schema. It runs against a **dedicated api instance and database**.
- **Configuration.** The harness tests the default values in "Configuration". The exceptions are the R-HEALTH-1 503 instance and the Schemathesis instance, which runs with its own `DATABASE_URL` and `PORT`, with `PUBLIC_BASE_URL` matching that port.

## Configuration

| Var | Component | Default |
|---|---|---|
| `DATABASE_URL` | api, harness (gray-box) | required. Local: `postgres://matthewnelson@localhost:5432/shortlink` |
| `PORT` | api | `8080` |
| `PUBLIC_BASE_URL` | api | `http://localhost:8080` (an origin with no trailing slash) |
| `COUNTRY_HEADER` | api | `cf-ipcountry` |
| `API_URL` | web (server-side) | `http://localhost:8080` |
| `TARGET_API` / `TARGET_WEB` | harness | `http://localhost:8080` / `http://localhost:3000` |

The api sends no CORS headers, since no browser calls it cross-origin.

## Explicitly out of scope (v1)
Authentication and per-user links, rate limiting, link expiry, editing links, GeoIP lookup, excluding bots from counts, forwarding query strings, CORS, and horizontal scaling. The verification report lists these under "what this does not prove".
