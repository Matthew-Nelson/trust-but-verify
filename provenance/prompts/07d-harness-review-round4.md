# Harness review, round 4 (gap round 1 → `harness-v1.2`)

Sent on 2026-10-18 via SendMessage to the round 1–3 harness reviewer (Fable), resumed from its own transcript. The workspace `tbv-ws/harness-review` was refreshed with `spec-v1.5` (SPEC, openapi, PROPOSALS, dispositions 07 and 08), the public harness at `0ece60f`, `harness-v1.1-to-0ece60f.diff` and `spec-v1.4-to-v1.5.diff`. The reviewer was told nothing about how these tests behave against any implementation. The text below is verbatim.

---

Harness review, round 4: new fault-injection tests. Same role and rules as before: read only files inside /Users/matthewnelson/Workspace/tbv-ws/harness-review, nothing else on disk, no web. Write only HARNESS_REVIEW_4.md at the workspace root.

What happened: after harness-v1.1 was signed off, the suite was measured against deliberately broken implementations written by a red team. Three behaviors went undetected by every suite. All three concern the two requirements the harness openly had no test for: R-ERR-7 (a 500 whose body isn't the canonical one) and R-REDIR-6 (a click-recording failure that changes or delays the redirect). A **fresh** harness author, given only those behaviors described in spec terms, found that spec-v1.4 didn't allow causing either condition. It proposed HP-27 to HP-30 and wrote two gated tests. Matthew adopted HP-27, HP-28 and HP-29 verbatim as spec-v1.5 and declined HP-30. The author then removed the gate. You get none of the implementations, the broken variants or any run against them.

Inputs in the workspace:
- spec/SPEC.md (spec-v1.5), spec-v1.4-to-v1.5.diff, spec/reviews/08-disposition.md, and spec/PROPOSALS.md (HP-27..30 at the end).
- harness/ at 0ece60f, and harness-v1.1-to-0ece60f.diff (everything changed since the harness-v1.1 you signed). The new files are `lib/pgproxy.ts` and `tests/api/faults.graybox.test.ts`.

What to check:
1. **The spec-v1.5 text.** Is the "Fault injection" bullet sound and unambiguous? Is the HP-29 latency definition measurable and fair? Could a conforming api fail it on a loaded machine, or a seconds-long delay pass it? Note the one implementation-facing sentence in HP-28 (accept an unencrypted connection when not required), which the disposition calls out.
2. **The proxy (`lib/pgproxy.ts`) against the PostgreSQL wire protocol.** Does it relay every message unchanged except as allowed? Is its "idle between transactions" test correct, including pipelined and extended-protocol traffic and partly sent messages? Could the injected SETs or the hidden replies ever corrupt a session, or let a reply reach the api? Does it decline SSL and GSS correctly? Is everything torn down on failure?
3. **The two tests against SPEC.** Can a conforming api fail either one (a false failure)? Can a clearly broken api pass (a false pass), in particular one that answers a non-canonical 500, or one that retries or waits for seconds when the click write fails? Is every inconclusive branch reported as a skip, never as a pass? Is the fault confined to the spawned instance, so no parallel test is affected?
4. **Nothing else moved.** The diff should touch no existing test, assertion or timeout. The `lib/db.ts` and `lib/links.ts` changes must be additive only. COVERAGE, SELF_CHECK and README must agree with the code.

Output, HARNESS_REVIEW_4.md: the verdict on the first line, exactly one of SIGN-OFF / SIGN-OFF WITH NITS / BLOCK, with the same blocking definition as before. Then findings HR4-01 onward (severity, file and line, problem, concrete failure scenario, suggested fix) and what you checked. If running something would settle a question, say exactly what to run. The coordinator can run it.
