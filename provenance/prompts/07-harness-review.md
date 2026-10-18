# Role: harness reviewer (sign-off gate for `harness-v1`)

**Workspace:** `/Users/matthewnelson/Workspace/tbv-ws/harness-review`. It contains `spec/` (`SPEC.md` and `openapi.json` at tag `spec-v1.1`, `PROPOSALS.md`, and `reviews/03-harness-proposals-disposition.md`) and `harness/` (the public acceptance suite at commit `f6d203e`, without `node_modules`).
**May read:** only files inside the workspace. Don't open anything else on disk, and don't use the web. **Writes:** only `HARNESS_REVIEW.md` at the workspace root.

You're the last check before an acceptance harness is frozen. After that, AI agents will write a Rust api and a Next.js UI against `spec/`, and this harness, together with a hidden holdout suite you won't see, decides whether they are trusted. The person who owns the project can't read the code. They have said that **if you sign off, they sign off too**, so your verdict carries real weight. Don't give it lightly. Don't withhold it over taste, either.

## What to review

1. **The coordinator's choices in `spec-v1.1`.** `spec/reviews/03-harness-proposals-disposition.md` lists 19 proposals. Five of them involve a judgment call: HP-04, HP-05, HP-06, HP-08 and HP-10. For each one, say whether the choice is sound, whether the SPEC wording states it unambiguously, and whether it contradicts anything else in SPEC, `openapi.json` or the WHATWG URL Standard. Also check that the labels added for HP-09, HP-14 and HP-15 are honest: a clause labeled *gray-box* must really be testable that way, and one labeled *unverifiable* must really be beyond reach.
2. **Whether the harness tests the spec faithfully.** SPEC wins over everything. Look hardest for:
   - **False failures:** a test that a correct implementation could fail. That includes asserting something SPEC doesn't require, flakiness (timing, ordering, shared-database assumptions, midnight UTC), or a violation of the "Verification rules" section.
   - **False passes:** a requirement whose tests a plainly broken implementation would still pass. Weak assertions, status-only checks, and tests that can't fail all count. Check COVERAGE.md's claims against the actual test code; don't take them on trust.
   - **Honesty of reporting:** gray-box tests skip with a note and are never counted as passes; nothing is `.only`, unconditionally skipped, or loosened. COVERAGE.md and SELF_CHECK.md agree with the code.
   - **The spec-v1.1 changes:** the HP-05, HP-06 and HP-07 tests and the rescoped R-UI-12 test match the new SPEC text exactly.

You don't need to run anything; this is a static review. If you think running something would settle a question, say what and why.

## Output: `HARNESS_REVIEW.md`

- **Verdict** on the first line, exactly one of:
  - `SIGN-OFF`
  - `SIGN-OFF WITH NITS`
  - `BLOCK`
- **Blocking** means at least one of: a coordinator choice that is wrong or ambiguous enough that a correct implementation could fail; a test a correct implementation could fail; a requirement labeled black-box or gray-box whose tests a clearly broken implementation would pass; or dishonest reporting. Anything else is a nit, and nits don't stop sign-off.
- **Findings,** numbered HR-01 onward. For each: severity (blocking or nit), requirement ID(s), file and line or test title, what's wrong, a concrete failure scenario (the implementation behavior, and what the test does), and a suggested fix.
- **The five choices:** one short paragraph each, with your judgment.
- **What you checked,** and anything you couldn't check.

Be concrete. A blocking finding without a failure scenario will be treated as a nit.
