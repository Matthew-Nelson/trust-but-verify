# Human acceptance checklist

The automated evidence checks the app against the spec. This checklist checks the one thing no tool can: **does it do what a person expects?** Matthew runs it by hand against the live app. It takes about 15 minutes. You need no Rust, only a browser.

## Start the app

In three terminals, from the repo root (Postgres.app must be running):

```sh
# 1. a fresh database
psql -h localhost -d postgres -c "DROP DATABASE IF EXISTS shortlink_accept WITH (FORCE)" -c "CREATE DATABASE shortlink_accept"

# 2. the api on :8080
cd impls/api && SQLX_OFFLINE=true cargo build --release && \
  DATABASE_URL=postgres://$USER@localhost:5432/shortlink_accept PORT=8080 PUBLIC_BASE_URL=http://localhost:8080 ./target/release/shortlink-api

# 3. the web UI on :3000
cd impls/web && pnpm install && API_URL=http://localhost:8080 pnpm build && API_URL=http://localhost:8080 pnpm start
```

Open http://localhost:3000.

## Steps

Record **pass** or **fail** for each step, and write down anything surprising, even when a step passes.

| # | Do this | Expect | Spec | Pass/fail | Notes |
|---|---|---|---|---|---|
| 1 | Look at the home page. | A form with "Destination URL", "Custom alias (optional)" and a "Shorten" button. A "Your links" table, with no rows yet. | R-UI-1, R-UI-5 | | |
| 2 | Type `example.com` and press Shorten. | A success message containing a short link, plus a "Copy short link" button. The new link appears at the top of the table with destination `https://example.com/`. | R-UI-2, R-UI-3, R-UI-5 | | |
| 3 | Press "Copy short link", then paste into the address bar of a new tab and go. | The paste is the short link. You land on `https://example.com/`. | R-UI-3, R-REDIR-1 | | |
| 4 | Reload the home page. | The link's Clicks column now shows 1. | R-REDIR-4, R-UI-5 | | |
| 5 | Create a link to `https://www.wikipedia.org` with alias `wiki`. Visit `http://localhost:8080/wiki`. | It redirects to Wikipedia. | R-ALIAS-1, R-REDIR-1 | | |
| 6 | Try alias `wiki` again with any URL. | The red message "That alias is taken. Try another." The table is unchanged. | R-ALIAS-3, R-UI-4 | | |
| 7 | Try alias `Admin`, then alias `ab`. | "That alias is reserved. Try another.", then "Aliases are 3 to 32 letters, numbers, hyphens or underscores." | R-ALIAS-2, R-ALIAS-1, R-UI-4 | | |
| 8 | Press Shorten with the destination empty, then with only spaces. | "Enter a valid http or https URL." each time, and nothing new in the table. | R-UI-12 | | |
| 9 | Try `ftp://example.com/` and `javascript:alert(1)`. | "Enter a valid http or https URL." Nothing runs, and no link is created. | R-URL-2, R-UI-4 | | |
| 10 | Click the `wiki` link's Stats. | A heading with `wiki`, "Total clicks: 1", "Clicks in range: 1", and a "Clicks per day" table whose last row is today (UTC) with 1. | R-UI-7, R-STATS-2 | | |
| 11 | Click "7 days", "90 days", then "30 days". | The address bar shows `?days=7`, `?days=90`, `?days=30`. The selected one is highlighted or marked current. | R-UI-8 | | |
| 12 | Visit `http://localhost:3000/links/nope-not-real`. | "Link not found". | R-UI-9 | | |
| 13 | On the home page, click Delete on one link, then Delete on another. | A "Confirm delete" button appears in the first row, then moves to the second. Nothing is deleted yet, and no browser pop-up appears. | R-UI-6 | | |
| 14 | Click "Confirm delete". Then visit that link's short URL. | The row disappears within about 2 seconds. The short URL now says not found (404). | R-UI-6, R-DEL-1, R-REDIR-3 | | |
| 15 | Use only the keyboard (Tab, Enter) to create a link and open its stats. | Everything is reachable and labeled sensibly. Note anything awkward. | R-UI-10 (in spirit) | | |

## Sign-off

- Date run:
- Result: __ of 15 passed
- Overall: does this behave the way you'd expect a URL shortener to? (yes / no / with reservations)
- Anything that surprised you, even if it passed:
