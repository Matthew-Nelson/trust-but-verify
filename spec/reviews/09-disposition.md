# Disposition of harness review round 4 (HR4-01..06)

**Review:** `09-fable-harness-review-4.md`, by the same blind Fable reviewer (rounds 1–3), working from `spec-v1.5` and harness `0ece60f` with the diff from `harness-v1.1`. Verdict: **SIGN-OFF WITH NITS** (0 blocking, 6 nits).
**Sign-off:** Matthew chose "Adopt HP-27/28/29" with the agreed route: blind fix, then blind review, then the coordinator tags. `harness-v1.2` is tagged with harness files byte-identical to the reviewed `0ece60f`. None of these nits is fixed before the tag.

| ID | Coordinator check | Resolution |
|---|---|---|
| HR4-01 | Agreed. "is an internal error (R-ERR-7)" could be read as the declined HP-30. The harness reads it leniently: no 500 means inconclusive. | Next spec revision: "...is an internal error *for the purpose of R-ERR-7's body rule*; it does not require a 500." |
| HR4-02 | Agreed. An operator `DATABASE_URL` that requires TLS would make the setup fail instead of skip. | Verification runs use plaintext `localhost` (tools and CI). Next harness change: classify it as inconclusive. |
| HR4-03 | Agreed, rare. A one-off stall over 1 s (including a GC pause in the harness's own Node process) on one faulted GET could fail a conforming api. | The mutant runner already excludes any test that fails in a clean baseline (3 per round), and the repeated-run table reports any intermittent failure. Next harness change: an optional single repeat of the fault phase on a latency-only failure. |
| HR4-04 | Agreed (README says four cases, COVERAGE and the code have five). | Next harness change. |
| HR4-05 | Agreed; safe direction (inconclusive only). | Next harness change. |
| HR4-06 | Partly settled. **Before the review, the coordinator ran both tests against clean `impl-v1`** (a real conforming-api run): both passed, the faults took effect (R-ERR-7 saw 500s on every request; R-REDIR-6 B = 31 ms, T = 1,031 ms, faulted GETs 1–2 ms). The three red-team behaviors are exercised by mutant round 1. The reviewer's scratch proxy cases and DISCARD ALL variant need an api modified by the coordinator, so they weren't run. | Recorded. Round 1 is the decisive run. |
