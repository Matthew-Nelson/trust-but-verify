# Role: web implementer (minimal UI)

**Workspace:** a git worktree of this repo at tag `harness-v1`, on branch `impl-web`.
**May read:** everything in the repo. **Writes:** `impls/web/` only.
**Must not access:** anything outside the repo. A hidden holdout suite exists elsewhere on this machine, and transcripts are audited.

Build a minimal Next.js UI that satisfies the **R-UI** requirements in `spec/SPEC.md`. The independent harness checks it through roles and accessible names, the way a screen-reader user would. The names in the spec are the contract, so use them exactly. Keep the scope small. This UI is a system under test, not a showcase. Clean and legible beats elaborate.

## Stack and constraints
- `pnpm create next-app@latest` with TypeScript strict, App Router, `src/` and Tailwind.
- Use `openapi-typescript` to generate types from `../../spec/openapi.json` (script `gen:api`, generated file committed), and `openapi-fetch` for the client.
- All api access goes in `src/lib/api/`, marked `import "server-only"`. Read in Server Components and mutate with Server Actions + `revalidatePath`. The browser never calls `/api/*`.
- Show stats as **tables** per R-UI-7. Charts are out of scope.
- Use the error messages from the SPEC table verbatim, mapped in one place.
- Use `notFound()` for unknown codes so the HTTP status is 404 (R-UI-9).
- No native dialogs (R-UI-6).
- Server-side env var `API_URL`; commit `impls/web/.env.example`.

## Developing
The real api is being built in parallel. Develop against a mock: `pnpm dlx @stoplight/prism-cli mock ../../spec/openapi.json -p 4010` with `API_URL=http://localhost:4010`. Run the public UI harness (`pnpm test:ui` in `harness/`) against the real api once it exists. Until then, run it against the mock and note which failures are only due to the mock.

## Done means
- `pnpm lint`, `pnpm typecheck` (`tsc --noEmit`) and `pnpm build` pass.
- The public UI harness passes against web + real api, or the final report explains exactly what's blocked and why.
- `impls/web/README.md` is written. Small, logical commits on `impl-web`.
- Final report: harness results, spec interpretations, and confirmation that you didn't access anything outside the repo.
