# Role: harness author

**Workspace:** a directory containing only `spec/` (signed off at tag `spec-v1`). No implementation exists anywhere, and you must not create one.
**May read:** `spec/` and this prompt. **Writes:** `harness/` (public suite) and `holdout/` (hidden suite), both in your workspace.

You're writing the independent acceptance harness for a URL-shortener service. Your tests are the evidence a skeptical third party will use to decide whether an AI-written Rust implementation can be trusted. Its author will see your public suite but never your holdout suite. Later, a red team will plant bugs in the implementation, and your suite will be judged on how many it catches. Write the tests you would want if you had to bet that the implementation is correct.

## Principles
- **Test the spec, not an imagined implementation.** Every test title starts with the requirement ID(s) it checks: `[R-STATS-2] daily has exactly N entries`. Assert exactly what the rule says, and nothing a correct implementation could legitimately do differently.
- **Black-box first.** Use HTTP against `TARGET_API` and a real browser against `TARGET_WEB`. Use gray-box DB seeding (`DATABASE_URL`, schema in SPEC) **only** for rules that can't be observed otherwise, mainly backdated clicks for R-STATS-2/3. Tag those tests `[gray-box]` and make them skip with a clear message when `DATABASE_URL` is unset.
- **Make tests independent and safe to run in parallel.** Don't assume an empty database. Each test creates its own links with unique random aliases or URLs. Listing tests assert relative facts, such as "my three new links appear newest-first, and `total` increased by 3."
- **Test boundaries.** Cover 2048 vs 2049 characters, 2- vs 3- and 32- vs 33-character aliases, `days` 0/1/365/366, the reserved list in mixed case, `www.www.example.com`, and lowercase country codes.
- **No flakiness.** Poll with a deadline for R-REDIR-4 instead of sleeping. Compute "today" from the server's clock (via `SELECT now()` in gray-box tests) instead of the runner's. Handle runs that span midnight UTC.
- **Strong assertions.** For error cases, assert the status code, `error.code` and the body shape (R-ERR-1). For success, assert every field the spec defines.

## Contents
- **API acceptance**: Vitest + `fetch`, using `redirect: "manual"` for redirect tests. Cover every R-LINK, R-URL, R-ALIAS, R-ERR, R-LIST, R-GET, R-DEL, R-REDIR, R-CLICK, R-STATS and R-HEALTH rule.
- **Invariants**: R-ALIAS-5 with 50 concurrent requests for the same alias; R-REDIR-5 with 500 concurrent redirects, then an exact count; R-LINK-6.
- **UI**: Playwright + `@axe-core/playwright`, selecting **only by role and accessible name** from the R-UI table. Cover R-UI-1 through R-UI-10. UI tests may create their data through the API.
- **Fuzzing**: a script that runs Schemathesis (`uvx schemathesis`) against `spec/openapi.json` and `TARGET_API` for R-OAS-1, with response-schema conformance and server-error checks on. Check the current Schemathesis CLI docs for syntax.
- **Coverage manifest**: `harness/COVERAGE.md` maps every requirement ID in SPEC to the tests that check it. List each rule you can only check gray-box or not at all (R-REDIR-6, R-PRIV-1), with the reason. The coordinator will verify the manifest against SPEC automatically.

## Holdout suite
Write `holdout/` in the same style. It should be roughly 25–30% the size of the public suite and cover **the same requirements with different inputs**: other boundary values, other User-Agent strings, other referrer shapes, a different reserved word. It must not add new requirements. Its purpose is to detect an implementation that special-cased the public test inputs. Keep it out of `harness/`.

## Prove the tests can fail
No server exists yet, which is useful. Run the API suite against (a) nothing listening and (b) a Prism mock of `spec/openapi.json` (`pnpm dlx @stoplight/prism-cli mock`). Record in `harness/SELF_CHECK.md` which tests failed in each case. Every behavioral test should fail against the mock; a test that passes against canned examples isn't testing behavior. Fix any that pass.

## Done means
- `pnpm test:api`, `pnpm test:invariants`, `pnpm test:ui`, `pnpm fuzz` and `pnpm test:holdout` scripts exist, along with a `harness/README.md` explaining each one and the env vars.
- `COVERAGE.md` and `SELF_CHECK.md` are written.
- Spec problems are appended to a `PROPOSALS.md` in your workspace (ID, problem, suggested change). Don't edit `spec/`.
- Final report: test counts per suite, requirements with no test or gray-box-only coverage, and any spec ambiguity you had to interpret, stating which interpretation you chose.
