# Launch header for the implementer runs (8 and 9)

Each implementer was sent this header, then the full text of its role prompt (`03-api.md` or `04-web.md`) at commit `941db32`. The two worktrees branch from `main` at `941db32`, not from the `harness-v1` tag itself. The only difference is the prompt wording in `03-api.md` and `04-web.md`; `harness/` and `spec/` are byte-identical to `harness-v1`.

---

## Header: api implementer (run 8)

Your workspace is the git worktree `/Users/matthewnelson/Workspace/tbv-wt/impl-api` (branch `impl-api`). Treat that directory as "the repo". Work only inside it, and commit on `impl-api`. Don't push. Don't touch other worktrees, other branches or the main checkout.

Ports: run your own server on 8080 (the harness default `TARGET_API`) and the fuzz instance on 8081 (`FUZZ_API`). Use `postgres://matthewnelson@localhost:5432/shortlink` and `.../shortlink_fuzz` (a hostname, not 127.0.0.1; see R-PRIV-1 in harness/README.md). Don't touch any database other than the ones you create. A web implementer is working in parallel on ports 3000 and 4010, so leave those alone.

Your role prompt follows.

---

## Header: web implementer (run 9)

Your workspace is the git worktree `/Users/matthewnelson/Workspace/tbv-wt/impl-web` (branch `impl-web`). Treat that directory as "the repo". Work only inside it, and commit on `impl-web`. Don't push. Don't touch other worktrees, other branches or the main checkout.

Ports: Next.js on 3000, the Prism mock on 4010. An api implementer is working in parallel on 8080 and 8081, so leave those alone. The real api is not available to you during this run. Develop and run the UI harness against the mock, then report which failures are only due to the mock. The coordinator will run the harness against web + real api afterwards and send you any real failures. Don't set `DATABASE_URL` in this run, so the UI gray-box tests skip.

Your role prompt follows.
