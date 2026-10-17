# Role: api implementer (Rust)

**Workspace:** a git worktree of this repo at tag `harness-v1`, on branch `impl-api`.
**May read:** everything in the repo. **Writes:** `impls/api/` only.
**Must not access:** anything outside the repo. In particular, a hidden holdout suite exists elsewhere on this machine. Agent transcripts are audited afterward for any access to it.

Build the URL-shortener API in Rust so it satisfies `spec/SPEC.md` and `spec/openapi.json`. An independent harness in `harness/` checks it. You may run the harness but not change it. A hidden holdout suite tests **the same requirements with different inputs**, so implement the rules generally. Code that special-cases test inputs will be caught. Later, a red team will read your code to plant realistic bugs, and the harness will be judged on catching them.

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
- Map `Json` and `Query` extractor rejections to the `bad_request` error body (R-ERR-2/3).
- Detect alias conflicts from the database unique violation, not select-then-insert (R-ALIAS-5).
- Record clicks without delaying the redirect, and never let a recording failure affect the response (R-REDIR-4/6). The click must still be visible within 2 seconds.

## Your own tests
Write unit tests for parsing and classification (R-CLICK-1/2/3, alias and URL validation), plus integration tests using `#[sqlx::test]`. They're for your confidence. They are not the acceptance evidence; the independent harness is.

## Done means
- `cargo fmt --check`, `cargo clippy`, `cargo test` and `cargo audit` are clean.
- The public harness passes against your running server: `pnpm test:api`, `test:invariants` and `fuzz`. If a harness test seems to contradict the spec, append to `spec/PROPOSALS.md` and report it. Don't work around it.
- `impls/api/README.md` covers setup, running, testing and env vars, and `impls/api/.env.example` is committed.
- Small, logical commits on `impl-api`.
- Final report: harness results, anything that doesn't pass, spec interpretations you made, and confirmation that you didn't access anything outside the repo.
