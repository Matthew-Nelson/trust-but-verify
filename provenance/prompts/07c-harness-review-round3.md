# Harness review, round 3 (post-freeze fixes → `harness-v1.1`)

Sent on 2026-10-18 via SendMessage to the round-1/2 harness reviewer (Fable), resumed from its own transcript. The workspace `tbv-ws/harness-review` was refreshed with `spec-v1.4` (SPEC, openapi, PROPOSALS, dispositions 03–06), the public harness at `8ba4d0b`, `harness-v1-to-8ba4d0b.diff` and `spec-v1.3-to-v1.4.diff`. The text below is verbatim.

---

Harness review, round 3: a small post-freeze change. Same role and rules as before: read only files inside /Users/matthewnelson/Workspace/tbv-ws/harness-review, nothing else on disk, no web. Write only HARNESS_REVIEW_3.md at the workspace root.

What happened: harness-v1 was frozen on your round-2 sign-off. Implementations were then built against it, and running them found three places where a conforming implementation cannot pass: HP-23 (R-UI-1 reads `required` on a `<button>`), HP-24 (the Fuzzing rule's `negative_data_rejection` contradicts R-ERR-3 on undefined query parameters), and HP-25 (`--max-redirects 0` turns every correct 302 into a network error). The coordinator confirmed all three. Matthew chose a blind fix: the coordinator amended SPEC to spec-v1.4, the original harness author (who has never seen any implementation) made the harness changes, and you check them. You also get none of the implementations, their output or their reports.

Inputs in the workspace:
- spec/SPEC.md (spec-v1.4), spec-v1.3-to-v1.4.diff, spec/reviews/06-disposition.md (why each change was made), spec/PROPOSALS.md (HP-23..26).
- harness/ at 8ba4d0b, and harness-v1-to-8ba4d0b.diff (everything changed since the tag you signed).

What to check:
1. **The spec-v1.4 changes.** Are the two new Fuzzing sentences and the "canonical form" definition sound, unambiguous and consistent with the rest of SPEC? Does either one loosen R-OAS-1 more than the contradiction requires?
2. **Each harness change is the narrowest fix.** R-UI-1: does `not.toBe(true)` still catch a `required` input, select or textarea? Fuzz: is `negative_data_rejection` still enabled for everything except undefined parameters? Is every 3xx really validated as the response (status, headers, `Location`) rather than skipped? Can anything in the fuzz run still follow a redirect or reach an external host? Review `fuzz/no_redirects.py` (it monkey-patches `requests` process-wide), the `--config-file` and cwd handling, and the `SCHEMATHESIS_HOOKS` blanking. Could a stray config or hook be picked up instead?
3. **Nothing else moved.** The diff should touch no other test, assertion, timeout or check. COVERAGE, SELF_CHECK and README must agree with the code. Treat `scripts/fuzz-stub.mjs` as self-check tooling. It must not be wired into any suite.
4. **HP-26:** the coordinator chose no spec change. Agree or disagree.

Output, HARNESS_REVIEW_3.md: the verdict on the first line, exactly one of SIGN-OFF / SIGN-OFF WITH NITS / BLOCK, with the same blocking definition as before. Then findings HR3-01 onward (severity, file and line, problem, concrete failure scenario, suggested fix) and what you checked. If running something would settle a question, say exactly what to run. The coordinator can run it.
