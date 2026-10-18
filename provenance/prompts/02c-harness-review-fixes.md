# Harness run 6: fix the harness review findings

Sent on 2026-10-18 via SendMessage to the harness author (agent `a1fa35d76a896a0d7`, resumed). Workspace `tbv-ws/harness` with `spec/` replaced by the `spec-v1.2` export, the review copied in as `HARNESS_REVIEW.md`, and the seal-2 holdout restored. Verbatim:

---

Harness run 6: fix the findings from an independent review of your public suite.

Same role, rules and workspace as before (/Users/matthewnelson/Workspace/tbv-ws/harness). Read only spec/, your harness/, holdout/, PROPOSALS.md and the new HARNESS_REVIEW.md there. Nothing else on disk.

What's new in your workspace:
- HARNESS_REVIEW.md: a blind reviewer's report on harness/ at spec-v1.1, findings HR-01..16. Read it in full.
- spec/ is now spec-v1.2. It changes wording only, to resolve HR-09, HR-10, HR-15 and HR-16: R-ERR-8 and R-REDIR-9 now say "matched route"; R-UI-4 is scoped to the create form; R-ROUTE-2 says routes match on the undecoded path and `%2F` doesn't split a segment; R-STATS-5 entries have at least 1 click. Check that no public or holdout test contradicts these, and fix any that do.
- holdout/ is restored (identical to what you delivered in run 5). It will be re-sealed afterwards.

Fix in harness/ (and in holdout/ wherever the same pattern appears):
- HR-01 (blocking): send the spawned-instance R-PRIV-1 requests with `Host: localhost:{port}` so the Host header can't contain the searched address. Exclude from the searched forms any form equal to the DATABASE_URL host, and annotate what was excluded.
- HR-02 (blocking): select the success short link by name or href prefix `PUBLIC_BASE_URL + "/"`, never "exactly one link of any kind". Fix it in fixtures.ts createdCode, a11y.spec.ts and network.spec.ts, and check the holdout UI for the same pattern.
- HR-03: drop the 200,000-byte probe. The coordinator couldn't reproduce the reset against a real axum server (300/300), but 65,537 already proves the rule.
- HR-04: compare R-DATA-3 columns as a set, not in ordinal order.
- HR-05: close the midnight-anchoring gaps the review lists (redo create+click inside the retry, anchor the gray-box seed, and retry the stats-page tests).
- HR-06: unpipe() both directions in TcpProxy blackhole mode.
- HR-07: move the two list tests that assert exact total or absolute positions into the sequential invariants suite.
- HR-08: compare timestamps as instants everywhere.
- HR-11: rename the R-HEALTH-2 recovery test so it doesn't claim "migrations applied".
- HR-12: fix the stale "exactly" (R-ERR-7) and "spec-v1" text.
- HR-13: search both address families in the DB-half R-PRIV-1 test.
- HR-14: R-UI-12 waits for the form to be visible instead of networkidle (public and holdout).

Same rules as before: no weakening beyond what is listed here. Re-run the self-check on every changed test (nothing listening, plus Prism where applicable), regenerate COVERAGE.md, update SELF_CHECK.md and README.md, and add any new spec problems to PROPOSALS.md as HP-21 onward. If you disagree with a finding, don't fix it; say why in your report.

Final report: what you changed per HR-id; public titles added, renamed or moved; holdout changes as counts only; updated suite counts; self-check results; disagreements and deviations.
