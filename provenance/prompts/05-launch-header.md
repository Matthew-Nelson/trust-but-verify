# Launch header for the red team run (11)

The red team was sent this header, then the full text of `05-redteam.md` at `impl-v1`.

---

Your workspace is `/Users/matthewnelson/Workspace/tbv-ws/redteam`, a git repo with one commit: `spec/SPEC.md`, `spec/openapi.json` and `impls/` exported from tag `impl-v1`. Treat that directory as "the repo" and read and write only inside it (plus your own temp files). Patches are relative to its root. Commit your mutants there if you like.

Environment:
- Rust via rustup: run `. "$HOME/.cargo/env"` if `cargo` isn't on PATH. Build the api offline, with no database: `cd impls/api && SQLX_OFFLINE=true cargo build --release`, with `DATABASE_URL` unset.
- **Don't connect to Postgres.** It isn't needed, and each new client prompts the machine owner. To check that a mutant "starts", run it with an unreachable database: `DATABASE_URL=postgres://x@127.0.0.1:1/none PORT=8090 PUBLIC_BASE_URL=http://localhost:8090 <binary>`. It should keep serving `/healthz` (503). Use ports 8090–8099 only, and stop everything you start.
- Web: `cd impls/web && pnpm install && API_URL=http://localhost:8090 pnpm build`. Don't run `pnpm dev` or `pnpm start` on port 3000.
- No web browsing needed. Package registries are fine for installs.

Your role prompt follows.
