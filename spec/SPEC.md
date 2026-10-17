# Shortlink spec (system under test)

**Status: DRAFT. Not yet signed off.** When signed off, this file is frozen and tagged `spec-v1`. Changes after that go through `spec/PROPOSALS.md` and need a new tag.

This is the single statement of intent that everything else answers to. The harness tests it, the implementations build to it, and the mutants violate it. Field-level request and response shapes are in `spec/openapi.json`. This file covers the rules a schema can't express.

Each rule has an ID (`R-AREA-n`). Every test names the ID(s) it checks, every mutant names the ID it breaks, and the verification report has one row per ID. An ID with no passing test is reported as **unverified**.

## The system

A URL shortener with click analytics. A user submits a long URL, optionally with an alias, and gets a short link. Visiting the short link redirects and records a click. A minimal web UI creates and deletes links and shows per-link stats.

```
browser ──► web UI (:3000) ──server-side──► api (:8080) ──► Postgres
   └────────── GET /{code} (short link) ──────┘
```

Short URLs point at the api (`PUBLIC_BASE_URL`). The web UI calls the api only from the server; the browser never calls `/api/*`.

---

## API requirements

### Creating links: `POST /api/links`

| ID | Rule |
|---|---|
| R-LINK-1 | A valid request with no alias returns **201** and a `Link` whose `code` is exactly 7 characters from `[A-Za-z0-9]` and whose `isCustom` is `false`. |
| R-LINK-2 | A valid request with an alias returns **201** with `code` equal to the alias and `isCustom` `true`. |
| R-LINK-3 | An `alias` that is omitted, `null` or `""` is treated as no alias (R-LINK-1). |
| R-LINK-4 | `shortUrl` equals `PUBLIC_BASE_URL + "/" + code`. |
| R-LINK-5 | A new link has `clickCount` 0 and `lastClickedAt` `null`. |
| R-LINK-6 | Generated codes are unique. 1,000 sequential creates produce 1,000 distinct codes. |

### URL validation

| ID | Rule |
|---|---|
| R-URL-1 | Leading and trailing whitespace in `url` is trimmed before validation. |
| R-URL-2 | `url` must parse as an absolute URL with scheme `http` or `https` and a non-empty host. Otherwise **422** `invalid_url`. This covers `javascript:`, `data:`, `ftp:`, relative URLs and bare words. |
| R-URL-3 | `url` longer than 2048 characters after trimming → **422** `invalid_url`. Exactly 2048 is accepted. |
| R-URL-4 | `url` whose host equals the host of `PUBLIC_BASE_URL` → **422** `invalid_url`. This prevents short links that point at other short links. |
| R-URL-5 | The stored URL is the parser's normalized form. `https://example.com` is returned as `https://example.com/`. |

### Alias validation

| ID | Rule |
|---|---|
| R-ALIAS-1 | An alias must match `^[A-Za-z0-9_-]{3,32}$`. Otherwise **422** `invalid_alias`. |
| R-ALIAS-2 | Reserved aliases → **422** `alias_reserved`. They are compared case-insensitively: `api`, `healthz`, `openapi.json`, `docs`, `admin`, `static`, `assets`, `favicon.ico`, `robots.txt`, `login`, `logout`. |
| R-ALIAS-3 | An alias already in use → **409** `alias_taken`. |
| R-ALIAS-4 | Codes are case-sensitive. `Launch` and `launch` are different links. |
| R-ALIAS-5 | Under concurrency: when N simultaneous requests ask for the same new alias, exactly one gets 201 and N−1 get 409 `alias_taken`. None get a 5xx. |

### Errors

| ID | Rule |
|---|---|
| R-ERR-1 | Every 4xx/5xx JSON response body is `{"error":{"code","message"}}`, with `code` from the enum in `openapi.json`. |
| R-ERR-2 | Precedence for `POST /api/links`, where the first failing rule wins: malformed body (bad JSON, wrong types, missing `url`) → **400** `bad_request`; then R-URL; then R-ALIAS-1; then R-ALIAS-2; then R-ALIAS-3. |
| R-ERR-3 | Out-of-range or non-integer query parameters (`limit`, `offset`, `days`) → **400** `bad_request`. |
| R-ERR-4 | Error messages never contain SQL, stack traces, file paths or internal type names. |
| R-ERR-5 | A request for an unknown code on any `/api/links/{code}*` route → **404** `not_found`. |

### Reading and deleting

| ID | Rule |
|---|---|
| R-LIST-1 | `GET /api/links` returns links newest-first. Default `limit` is 20 (max 100) and default `offset` is 0. |
| R-LIST-2 | `total` is the count of all links, ignoring pagination. `limit` and `offset` echo the values in effect. |
| R-GET-1 | `GET /api/links/{code}` returns the `Link`. `clickCount` and `lastClickedAt` are all-time and reflect recorded clicks. |
| R-DEL-1 | `DELETE /api/links/{code}` returns **204**. After that, the code 404s on every route, including the redirect. |
| R-DEL-2 | After deletion the code can be reused as an alias. |

### Redirect: `GET /{code}`

| ID | Rule |
|---|---|
| R-REDIR-1 | A known code → **302** with `Location` set to the stored URL. |
| R-REDIR-2 | The redirect response includes `Cache-Control: no-store`. |
| R-REDIR-3 | An unknown code → **404** with a `text/plain` body. |
| R-REDIR-4 | Each redirect records exactly one click. Within 2 seconds of the redirect response, the click is visible in `clickCount` and stats. |
| R-REDIR-5 | Under concurrency: after N simultaneous redirects (N=500), `clickCount` rises by exactly N. No clicks are lost or duplicated. |
| R-REDIR-6 | A failure to record a click never changes the redirect response. *(Gray-box: verified by a mutant, not by a black-box test.)* |

### What a click records

| ID | Rule |
|---|---|
| R-CLICK-1 | Referrer: the host of the `Referer` header, lowercased, with one leading `www.` stripped. Missing or unparseable → reported as `direct`. |
| R-CLICK-2 | Country: the value of the header named by `COUNTRY_HEADER` (default `cf-ipcountry`), uppercased, accepted only if it's exactly 2 ASCII letters. Anything else → reported as `unknown`. |
| R-CLICK-3 | Device: the first matching rule wins, case-insensitive. No `User-Agent` → `unknown`; contains `bot`, `crawl`, `spider`, `preview` or `facebookexternalhit` → `bot`; contains `ipad` or `tablet` → `tablet`; contains `mobi`, `iphone` or `android` → `mobile`; anything else → `desktop`. |
| R-PRIV-1 | Client IP addresses are never stored. *(Gray-box: verified by inspecting the schema.)* |

### Stats: `GET /api/links/{code}/stats?days=N`

| ID | Rule |
|---|---|
| R-STATS-1 | `days` defaults to 30 and must be 1–365. |
| R-STATS-2 | `daily` has exactly `days` entries, oldest first. The last entry is today (UTC), and days with no clicks appear with `clicks: 0`. |
| R-STATS-3 | A click at `T` counts toward the UTC calendar date of `T`. The window includes clicks from 00:00:00 UTC on the first day through now. Clicks before the window are excluded from everything except `totalClicks`. |
| R-STATS-4 | `rangeClicks` equals the sum of `daily[].clicks`. `totalClicks` is all-time. |
| R-STATS-5 | `topReferrers` and `topCountries` count only clicks in the window. Each has at most 5 entries, sorted by clicks descending, then name ascending. |
| R-STATS-6 | `devices` lists every device class seen in the window, in the same sort order. |

### Operations

| ID | Rule |
|---|---|
| R-HEALTH-1 | `GET /healthz` → 200 `{"status":"ok"}` when the database is reachable, otherwise 503 `unavailable`. |
| R-OAS-1 | Every response from every operation conforms to `spec/openapi.json`. This is checked by property-based fuzzing (Schemathesis). |

---

## Web UI requirements (minimal)

The UI is verified through its accessible roles and names, the same way a screen-reader user experiences it. The names below are **contract**: the UI must use them exactly, and the harness selects elements by them.

| ID | Rule |
|---|---|
| R-UI-1 | `/` has a textbox labeled **"Destination URL"**, a textbox labeled **"Custom alias (optional)"** and a button named **"Shorten"**. |
| R-UI-2 | If the destination has no scheme, `https://` is added before submitting. Entering `example.com` creates a link to `https://example.com/`. |
| R-UI-3 | On success, an element with role `status` contains a link whose name and `href` are the new `shortUrl`, plus a button named **"Copy short link"**. |
| R-UI-4 | On an API error, an element with role `alert` shows the message for that error code from the table below. |
| R-UI-5 | `/` shows a table named **"Your links"** with column headers **Short link**, **Destination**, **Clicks**, **Created**, newest first. Each row has a link named **"Stats for {code}"** to `/links/{code}` and a button named **"Delete {code}"**. |
| R-UI-6 | Clicking "Delete {code}" reveals a button named **"Confirm delete"**. Confirming removes the row; nothing is deleted without confirming. No native browser dialogs are used. |
| R-UI-7 | `/links/{code}` has a level-1 heading containing the code. It shows the text **"Total clicks: N"** and **"Clicks in range: N"**, a table named **"Clicks per day"** (columns **Date**, **Clicks**, one row per day in the window), and tables named **"Top referrers"**, **"Top countries"** and **"Devices"** (columns **Name**, **Clicks**). |
| R-UI-8 | `/links/{code}` has links named **"7 days"**, **"30 days"** and **"90 days"** that set `?days=`. The current one has `aria-current="page"`. |
| R-UI-9 | `/links/{unknown}` responds with HTTP 404 and a level-1 heading **"Link not found"**. |
| R-UI-10 | Every page has zero `serious` or `critical` axe-core accessibility violations. |

### Error messages (R-UI-4)

| `error.code` | Message shown |
|---|---|
| `invalid_url` | Enter a valid http or https URL. |
| `invalid_alias` | Aliases are 3–32 letters, numbers, hyphens or underscores. |
| `alias_reserved` | That alias is reserved. Try another. |
| `alias_taken` | That alias is taken. Try another. |
| anything else | Something went wrong. Please try again. |

---

## Data model (contract for gray-box tests)

The harness is black-box wherever it can be. Time-window rules (R-STATS-2/3) can't be tested over HTTP alone, because a test can't record a click "yesterday". For those, the harness seeds backdated rows directly. That makes this schema part of the contract:

```sql
links  (id BIGINT IDENTITY PK, code TEXT UNIQUE NOT NULL, url TEXT NOT NULL,
        is_custom BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now())
clicks (id BIGINT IDENTITY PK, link_id BIGINT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
        clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(), referrer_host TEXT, country CHAR(2),
        device TEXT NOT NULL CHECK (device IN ('desktop','mobile','tablet','bot','unknown')))
INDEX ON clicks (link_id, clicked_at)
```

No other tables or columns exist that store request data (R-PRIV-1).

## Configuration

| Var | Component | Default |
|---|---|---|
| `DATABASE_URL` | api, harness (gray-box) | required. Local: `postgres://matthewnelson@localhost:5432/shortlink` |
| `PORT` | api | `8080` |
| `PUBLIC_BASE_URL` | api | `http://localhost:8080` |
| `COUNTRY_HEADER` | api | `cf-ipcountry` |
| `CORS_ALLOWED_ORIGIN` | api | `http://localhost:3000` |
| `API_URL` | web (server-side) | `http://localhost:8080` |
| `TARGET_API` / `TARGET_WEB` | harness | `http://localhost:8080` / `http://localhost:3000` |

## Explicitly out of scope (v1)
Authentication and per-user links, rate limiting, link expiry, editing links, GeoIP lookup, bot filtering from counts, and horizontal scaling. The verification report lists these under "what this does not prove".
