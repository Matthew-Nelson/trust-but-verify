# Gap round 2: a fresh harness author makes the R-ALIAS-5 race test robust to a slow client

Sent on 2026-10-22 to a **fresh** Opus agent (not an earlier harness author). Workspace `~/tbv-sandbox/gap2` (outside `~/Workspace`): `spec/SPEC.md` and `spec/openapi.json` (`spec-v1.5`), the public `harness/` at `harness-v1.2`, and an empty `PROPOSALS.md`. No implementation, mutants, holdout, reviews or other proposals. The text below is verbatim.

---

You are a harness author for an independent acceptance test suite. Your workspace is /Users/matthewnelson/tbv-sandbox/gap2. It contains spec/SPEC.md and spec/openapi.json (the source of truth, tag spec-v1.5), harness/ (the existing public acceptance suite, frozen and reviewed as harness-v1.2; read its README.md and COVERAGE.md first), and an empty PROPOSALS.md. Read and write only inside this workspace (plus your own temp files). Don't open anything else on disk. You may use npm/PyPI and public documentation.

**Why you're here.** The suite is measured by running it against deliberately broken implementations written by a separate red team. You won't see the implementations or the broken variants, and you shouldn't need to. One undetected behavior is described here in spec terms only:

**R-ALIAS-5.** An api on which several of N concurrent creates of the same new alias can each get 201 is caught reliably on a fast developer machine, but not on a slow one. On a 2-CPU CI runner it went undetected in one full round (all three trials of `tests/invariants/alias-race.test.ts` passed), and in another round only one of the three trials caught it (2 of 20 got 201). Reproduced locally by starving the **test process** of CPU while the api ran normally: only 8 of 24 trials caught it, and in 2 of 8 runs no trial did. The api isn't the bottleneck; the 20 requests don't reach it close enough together when the client is slow.

SPEC says the N=20 requests are "released together". Your job: make the R-ALIAS-5 test release them together in a way that holds up when the test process itself is slow, so that an api with this race is caught reliably, while a conforming api (one that lets the database decide, so exactly one create can win) always passes.

Constraints:
- **SPEC wins.** Keep N=20 requests per trial, the same alias, 20 distinct `url` values, and the assertions SPEC states (exactly one 201, nineteen 409 `alias_taken`, no other status; afterwards `GET /api/links/{alias}` returns the winner's `url`). How the requests are released, and how many independent trials the test runs, are yours to decide; justify both. If you think SPEC needs to change, write the exact proposal in PROPOSALS.md (HP-31 onward) and carry on with the current text. Don't edit spec/.
- **Don't weaken anything.** No retries that hide a failure, no loosened assertions, no special-casing. Every trial that sees more than one 201 fails the test. Don't change or remove any other test.
- **Keep it bounded.** The whole invariants suite runs on every push. The R-ALIAS-5 test should finish in well under 30 s against a local api.
- **Safety.** Other tests run in parallel against the same api and database. Use fresh, unique aliases per trial, as the suite already does.
- Titles start with `[R-ALIAS-5]`. Keep the existing file and helpers where you can; anything you add to `lib/` must be additive.
- **Self-check:** the test must fail against nothing listening, and against the Prism mock (spawned as the api). Run nothing else.
- Update COVERAGE.md (via `pnpm coverage:manifest`), README.md and SELF_CHECK.md to match.

Final report: what you changed (files, test titles), how the requests are now released and why that holds up on a slow client, how many trials and why, why a conforming api always passes, self-check results, any HP-31+ proposals, and anything you're unsure of.
