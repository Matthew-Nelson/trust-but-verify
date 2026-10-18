# Role: api implementer (Rust)

**Workspace:** a git worktree of this repo at tag `harness-v1`, on branch `impl-api`.
**May read:** everything in the repo. **Writes:** `impls/api/` only.
**Must not access:** anything outside the repo. In particular, a hidden holdout suite exists elsewhere on this machine. Agent transcripts are audited afterward for any access to it.

Build the URL-shortener API in Rust so it satisfies `spec/SPEC.md` and `spec/openapi.json` (tag `spec-v1.1`). Where this prompt and SPEC disagree, SPEC wins. An independent harness in `harness/` checks it. You may run the harness but not change it. A hidden holdout suite tests **the same requirements with different inputs**, so implement the rules generally. Code that special-cases test inputs will be caught. Later, a red team will read your code to plant realistic bugs, and the harness will be judged on catching them.

## Stack
Add dependencies with `cargo add` so you get current stable versions. Use edition 2024.
- `axum` and `tokio` (axum 0.8 path syntax, `/{code}`), `tower-http` (trace), `tracing` + `tracing-subscriber`. No CORS (see SPEC "Configuration").
- `url`: this crate implements the WHATWG URL Standard, which SPEC requires.
- `sqlx` (postgres, runtime-tokio, tls-rustls, macros, migrate, chrono). Use compile-time-checked `query!`/`query_as!` and commit `.sqlx/` from `cargo sqlx prepare` so the build doesn't need a live DB.
- `serde` (camelCase on API types), `thiserror`, `url`, `rand`, `chrono`
- Migrations in `impls/api/migrations/`, applied at startup. If the database is unreachable, keep serving `/healthz` (503) and retry; never exit (R-HEALTH-2). The schema must match SPEC "Data model" exactly, because gray-box tests depend on it.

## Code standards
- `#![forbid(unsafe_code)]` in `main.rs`. `cargo clippy --all-targets -- -D warnings` and `cargo fmt --check` must pass.
- The owner can't read Rust yet but may walk through this code later. Prefer plain, explicit code; avoid trait abstractions that have only one implementation. Start each module with a short `//!` doc comment.
- Keep it flat: `main.rs`, `config.rs`, `app.rs` (router + state), `error.rs`, `links.rs`, `redirect.rs`, `stats.rs`, roughly.

## SPEC rules that the stack's defaults break
These are places where axum, serde or the HTTP stack behaves differently from SPEC out of the box. Each one is a requirement, not a style choice:
- **Request body (R-ERR-2):** `Content-Type` is ignored. Read the raw bytes and parse them with `serde_json` yourself, instead of using the `Json` extractor, which rejects by content type. 65,536 bytes is accepted and 65,537 bytes is a 400. Invalid UTF-8, unpaired surrogate escapes and every other R-ERR-2 malformation are 400. With duplicate keys, the last value wins.
- **Query integers (R-ERR-3, "Query integer"):** don't use the `Query` extractor for `limit`, `offset` or `days`. It turns `+` into a space, accepts leading zeros, and doesn't reject repeated parameters. Parse the raw query string by the SPEC definition.
- **HEAD (R-REDIR-7, R-ERR-8):** axum answers HEAD by running the GET handler. A HEAD on `/{code}` must record **no** click.
- **Routing (R-ERR-6, R-ROUTE-1..3, R-ERR-5, R-REDIR-3):** check in the order SPEC gives. Unmatched paths are 404 regardless of method: JSON `not_found` under `/api/` and `text/plain` elsewhere. That includes dot segments spelled with `%2e`, empty segments, malformed escapes and trailing slashes. 405 responses carry an exact `Allow` header (JSON under `/api/` and `/healthz`, `text/plain` on `/{code}`), and `OPTIONS` is 405 everywhere. Code segments, including `/{code}`, are percent-decoded exactly once.
- **Logs (R-PRIV-1):** never log the client address in any form, including via `tower-http` trace spans or connection info.
- **Clock:** "now" and "today" come from the database (`now()`), never from the Rust process.
- Detect alias conflicts from the database unique violation, not select-then-insert (R-ALIAS-5).
- Record clicks without delaying the redirect, and never let a recording failure affect the response (R-REDIR-4/6). The click must still be visible within 2 seconds.

## Your own tests
Write unit tests for parsing and classification (R-CLICK-1/2/3, alias and URL validation), plus integration tests using `#[sqlx::test]`. They're for your confidence. They are not the acceptance evidence; the independent harness is.

## Environment
- Rust is installed via rustup. If `cargo` isn't on PATH, run `. "$HOME/.cargo/env"` first. Install `sqlx-cli` and `cargo-audit` with `cargo install` if you need them.
- Postgres.app runs on `localhost:5432` (user `matthewnelson`, no password). Create your own databases, such as `shortlink` and `shortlink_fuzz`. If it's unreachable, stop and say so.
- The binary must honor `DATABASE_URL`, `PORT`, `PUBLIC_BASE_URL` and `COUNTRY_HEADER`, because the harness starts its own instances through `API_BIN` (see `harness/README.md`).

## Done means
- `cargo fmt --check`, `cargo clippy`, `cargo test` and `cargo audit` are clean.
- The public harness passes against your running server, with `DATABASE_URL` and `API_BIN` set so that gray-box tests run instead of skipping: `pnpm test:api`, `test:invariants`, and `fuzz` against a dedicated instance and database (`FUZZ_API`). Report every skipped test and why it skipped. If a harness test seems to contradict the spec, append to `spec/PROPOSALS.md` and report it. Don't work around it.
- `impls/api/README.md` covers setup, running, testing and env vars, and `impls/api/.env.example` is committed.
- Small, logical commits on `impl-api`.
- Final report: harness results, anything that doesn't pass, spec interpretations you made, and confirmation that you didn't access anything outside the repo.
