# Gap round 1: a fresh harness author closes the gaps found by the mutants

Sent on 2026-10-18 to a **fresh** Opus agent (not the original harness author). Workspace `tbv-ws/gap1`: `spec/SPEC.md` and `spec/openapi.json` (`spec-v1.4`), the public `harness/` at `harness-v1.1`, and an empty `PROPOSALS.md`. No implementation, mutants, holdout, reviews or other proposals. The text below is verbatim.

---

You are a harness author for an independent acceptance test suite. Your workspace is /Users/matthewnelson/Workspace/tbv-ws/gap1. It contains spec/SPEC.md and spec/openapi.json (the source of truth, tag spec-v1.4), harness/ (the existing public acceptance suite, frozen and reviewed as harness-v1.1; read its README.md and COVERAGE.md first), and an empty PROPOSALS.md. Read and write only inside this workspace (plus your own temp files). Don't open anything else on disk. You may use npm/PyPI and public documentation.

**Why you're here.** The suite was measured by running it against deliberately broken implementations written by a separate red team. These undetected behaviors went through every suite (public, a hidden holdout and fuzzing). They're described in spec terms only. You won't see the implementations or the broken variants, and you shouldn't need to.

1. **R-ERR-7.** The api answered 500 with a body that is not JSON-equal to `{"error":{"code":"internal","message":"Internal server error."}}` (for example, internal error text added to `message`), and nothing noticed. No suite run ever caused a 500, so the opportunistic check in `lib/http.ts` never fired.
2. **R-REDIR-6 (response changed).** When recording a click failed, the redirect response changed: the client got something other than the 302 it would otherwise get. Nothing noticed.
3. **R-REDIR-6 (delayed).** When recording a click failed, the 302 was delayed by several seconds. Nothing noticed.

In each case, no test ever made the api hit an internal error or a click-recording failure. COVERAGE.md currently says both requirements can't be tested from outside. Your job is to find out whether SPEC's gray-box contract lets the harness cause those conditions **deliberately and safely**, and if so, to add tests that would catch each behavior.

Constraints:
- **SPEC wins.** Use only what SPEC allows: its "Data model", the gray-box contract, `API_BIN`-spawned instances, and what "Verification rules" permits. If a test needs something SPEC doesn't clearly allow, add the exact contract you need to PROPOSALS.md (HP-27 onward). Still write the test, behind a clearly named gray-box skip, and say so in your report. Don't edit spec/.
- **Tests must catch the behavior generally.** Write them from the requirement text, not from the examples above. A conforming api must pass. In particular, R-REDIR-6 says "never changes the redirect response or delays it beyond normal latency", so define "normal latency" from something measurable in the same test, and justify the threshold.
- **Safety.** Other tests run in parallel against the same database. Any fault you inject must affect only your test's own data, or a database or instance the harness owns, and must be undone afterwards, including when the test fails.
- Titles start with requirement IDs and carry `[gray-box]` where applicable. Gray-box tests skip with the existing note prefixes when `DATABASE_URL` or `API_BIN` is unset. Don't change or weaken any existing test.
- **Self-check:** every new test must fail against nothing listening, and against the Prism mock where that's meaningful. Run nothing else.
- Update COVERAGE.md (via `pnpm coverage:manifest`), README.md and SELF_CHECK.md to match.

Final report: what you added (file, test titles), how each test causes the condition and what it asserts, why a conforming api passes, self-check results, any HP-27+ proposals, and anything you decided can't be tested, with the reason.

---

## Follow-up (run 12b), sent via SendMessage after `spec-v1.5`, verbatim

Gap round 1, follow-up: SPEC adopted your proposals. spec/SPEC.md in your workspace is now spec-v1.5.

Same role, same rules, same workspace (/Users/matthewnelson/Workspace/tbv-ws/gap1); read and write only there.

Dispositions:
- HP-27, HP-28, HP-29: adopted **verbatim**. Check spec/SPEC.md: the R-ERR-7 and R-REDIR-6 rows, the "Configuration" bullet, and the new "Fault injection" bullet in Verification rules.
- HP-30: **declined**. On an api that answers a database-rejected statement with a non-500 status, your R-ERR-7 test stays inconclusive (pending), as designed.

Please:
1. Remove the proposal gate. The two fault-injection tests should run by default whenever `API_BIN` and `DATABASE_URL` are set, with the existing skip notes when they're not. Remove `HARNESS_PROPOSALS` and the `pending (gray-box, proposed ...)` note entirely. Keep every `inconclusive (gray-box): ...` outcome as it is.
2. Check that the tests match the adopted SPEC text exactly. Change anything that doesn't, and report it.
3. Update COVERAGE.md (via `pnpm coverage:manifest`), README.md, SELF_CHECK.md and the "SPEC" version strings to spec-v1.5. Mark HP-27..29 as adopted and HP-30 as declined in your PROPOSALS.md.
4. Re-run your self-check on the two tests (nothing listening; Prism spawned as the api). Run nothing else.

Change nothing else. Final report: files changed, the exact diff summary, and the self-check results.
