# Harness review, round 5 (gap round 2: R-ALIAS-5 release)

Sent on 2026-10-22 to a **fresh** Fable agent. The round 1–4 reviewer ran in an earlier session and couldn't be resumed. Workspace `~/tbv-sandbox/review5`: `spec/SPEC.md` and `spec/openapi.json` (`spec-v1.5`), the author's `PROPOSALS.md` (HP-31), the gap-round-2 harness, and `harness-v1.2-to-gap2.diff`. The reviewer was told nothing about how the new test behaves against any implementation (the coordinator's pre-check results were withheld). The text below is verbatim.

---

You are reviewing changes to an independent acceptance test suite. Your workspace is /Users/matthewnelson/tbv-sandbox/review5. Read only files inside it, nothing else on disk, and no web. Write only HARNESS_REVIEW_5.md at the workspace root. Don't run anything: this is a reading review.

Background: the suite checks an implementation against spec/SPEC.md (the source of truth, tag spec-v1.5). It is measured against deliberately broken implementations written by a separate red team. For R-ALIAS-5, an api on which several of 20 concurrent creates of the same new alias can each get 201 was caught reliably on a fast machine but not on a slow 2-CPU CI runner: one full round passed all 3 trials. A fresh harness author, given only that behavior in spec terms, changed how the 20 requests are released and raised the trial count from 3 to 10. They also proposed HP-31 to define "released together" in SPEC. You get no implementation, broken variant or run against either.

Inputs:
- spec/SPEC.md and spec/openapi.json (spec-v1.5). R-ALIAS-5 is in the "Aliases" table.
- PROPOSALS.md: HP-31.
- harness/: the suite after the change. New file `lib/release.ts`; changed `tests/invariants/alias-race.test.ts`, `scripts/coverage.mjs`, COVERAGE.md, README.md, SELF_CHECK.md.
- harness-v1.2-to-gap2.diff: everything that changed since the previous signed-off harness (harness-v1.2).

What to check:
1. **`lib/release.ts` as an HTTP/1.1 client.** Are the requests well-formed (request line, Host, Content-Length matching the UTF-8 byte length of the body, Content-Type)? Is "held one byte short" sound, including for bodies where the last byte is part of a multi-byte character? Is the response parser correct for Content-Length, chunked and read-until-close responses, split reads, and a connection closed early? Are timeouts, errors and partial failures handled so a trial can't hang or silently pass? Is everything torn down?
2. **The release.** Does it actually make the final bytes arrive close together regardless of client speed, as claimed? What could still spread them out (Nagle, socket buffering, event-loop stalls, the 100 ms settle)? Is anything an api could legitimately do before the last byte (for example answering early, or `Expect: 100-continue` handling) treated correctly?
3. **The test against SPEC.** Can a conforming api fail it: a false failure, for example from 20 parallel connections, `Connection: close`, a header the api rejects, or an early answer? Can a clearly broken api pass: a false pass? Are the assertions exactly the ones R-ALIAS-5 states, with nothing loosened and nothing retried? Is each of the 10 trials independent, with a fresh alias, and safe to run alongside other tests?
4. **HP-31.** Is the proposed text sound, unambiguous and implementable by an independent harness? Does it change what a conforming api must do? Note any wording you would change.
5. **Nothing else moved.** The diff should touch no other test, assertion or timeout. Changes in `lib/` must be additive only. COVERAGE, SELF_CHECK and README must agree with the code.

Output, HARNESS_REVIEW_5.md:
- The verdict on the first line, exactly one of `SIGN-OFF`, `SIGN-OFF WITH NITS` or `BLOCK`.
- **Blocking** means at least one of: a test a correct implementation could fail; a requirement whose test a clearly broken implementation would pass; a proposal that is wrong or ambiguous enough that a correct implementation could fail; or dishonest reporting. Anything else is a nit, and nits don't stop sign-off.
- Findings HR5-01 onward. For each: severity (blocking or nit), file and line, what's wrong, a concrete failure scenario (the implementation behavior, and what the test does), and a suggested fix. A blocking finding without a failure scenario will be treated as a nit.
- Then what you checked. If running something would settle a question, say exactly what to run. The coordinator can run it.
