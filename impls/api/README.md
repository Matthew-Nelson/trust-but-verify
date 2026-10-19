# Shortlink API (Rust)

The URL-shortener API for `spec/SPEC.md` and `spec/openapi.json`. Axum + sqlx (Postgres). It listens on `0.0.0.0:$PORT`.

## Layout

| File | What it holds |
|---|---|
| `src/main.rs` | Process startup: config, lazy DB pool, background migrations, server |
| `src/config.rs` | Environment variables |
| `src/app.rs` | Shared state, the single request router (route, method, query, lookup in SPEC order), `/healthz`, migration retry loop |
| `src/links.rs` | Create / list / get / delete, URL and alias validation |
| `src/redirect.rs` | `GET /{code}`, background click recording, referrer / country / device rules |
| `src/stats.rs` | `GET /api/links/{code}/stats` |
| `src/query.rs` | Raw query-string integers and percent-decoding (SPEC "Query integer") |
| `src/error.rs` | Error type and the fixed JSON / text error bodies |
| `migrations/` | The SPEC "Data model" schema, applied at startup |
| `.sqlx/` | Offline query metadata, so the build needs no database |

## Setup

Requires Rust via rustup (the exact toolchain is pinned in `rust-toolchain.toml`) and a Postgres database.

```sh
createdb -h localhost shortlink
cargo build --release
```

Builds use the committed `.sqlx/` data. If you change a `query!` macro, regenerate it with a live database:

```sh
cargo install sqlx-cli --no-default-features --features rustls,postgres
export DATABASE_URL=postgres://matthewnelson@localhost:5432/shortlink
sqlx migrate run
cargo sqlx prepare -- --all-targets
```

## Running

```sh
DATABASE_URL=postgres://matthewnelson@localhost:5432/shortlink ./target/release/shortlink-api
```

Migrations run in the background at startup. If the database is down, the server still starts, `/healthz` returns 503, and it retries until the database appears.

## Environment variables

| Var | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | required | Postgres URL. Use a hostname such as `localhost`, not `127.0.0.1` (SPEC R-PRIV-1 harness note) |
| `PORT` | `8080` | Listen port |
| `PUBLIC_BASE_URL` | `http://localhost:8080` | Origin used to build `shortUrl` and to reject self-referencing destinations. No path, no trailing slash |
| `COUNTRY_HEADER` | `cf-ipcountry` | Request header read for a click's country |
| `RUST_LOG` | `info` | Log filter. Logs never contain client addresses or request paths |

`.env.example` lists them.

## Testing

```sh
export DATABASE_URL=postgres://matthewnelson@localhost:5432/shortlink   # integration tests create temporary databases
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test        # unit tests + #[sqlx::test] integration tests in tests/api.rs
cargo audit
```

The acceptance evidence is the independent harness in `../../harness` (run it against a running server):

```sh
cd ../../harness
export DATABASE_URL=postgres://matthewnelson@localhost:5432/shortlink
export API_BIN=$PWD/../impls/api/target/release/shortlink-api
pnpm test:api && pnpm test:invariants
# fuzzing needs its own instance and database:
DATABASE_URL=postgres://matthewnelson@localhost:5432/shortlink_fuzz PORT=8081 PUBLIC_BASE_URL=http://localhost:8081 ../impls/api/target/release/shortlink-api &
FUZZ_API=http://localhost:8081 pnpm fuzz
```

## Notes on SPEC choices

- Routing is done by hand on the raw path (not with axum's matcher) so dot segments, empty segments, malformed escapes and `%2F` behave exactly as R-ROUTE-1..3 say.
- Request bodies are parsed from raw bytes with `serde_json`; `Content-Type` is ignored.
- "Now" and "today" come from Postgres (`now()`); the Rust process never reads a clock.
- Clicks are inserted by a spawned task after the redirect response is built; a failed insert is logged and does not change the response.
