# Disposition of the harness review (HR-01..16)

**Review:** `04-fable-harness-review.md`, by a blind Fable reviewer working only from `spec-v1.1`, the HP disposition and the public harness at `f6d203e`. Verdict: **BLOCK** (3 blocking, 13 nits).
**Sign-off rule:** Matthew delegated `harness-v1` sign-off: "spawn a review agent. If they give signoff then i approve as well." So the fixes below go back to the same reviewer for a verdict.
**Coordinator verification:** each blocking finding was checked against the code before acceptance. HR-03 was also tested empirically.

| ID | Reviewer severity | Coordinator check | Resolution | Who |
|---|---|---|---|---|
| HR-01 | blocking | **Confirmed.** `spawned.graybox.test.ts` rewrites the base to `127.0.0.1`, so every request carries `Host: 127.0.0.1:{port}`, the same string the log search looks for. | Accepted: send `Host: localhost:{port}`, exclude the `DATABASE_URL` host's forms, and annotate exclusions. | harness |
| HR-02 | blocking | **Confirmed.** `fixtures.ts` `createdCode`, `a11y.spec.ts:24` and `network.spec.ts:14` require exactly one link of any kind in the status region. | Accepted: select the short link by name or `href` prefix `PUBLIC_BASE_URL + "/"`. Also apply the fix to any holdout selector of the same kind. | harness |
| HR-03 | blocking (moderate confidence) | **Not reproduced.** A throwaway axum 0.8 server with `DefaultBodyLimit::max(65536)`, which rejects by `Content-Length` without reading the body, answered 300 of 300 probes correctly through the harness's own `raw()`: 65,536 → 201, 65,537 → 400, 200,000 → 400 (macOS loopback). | Downgraded to a nit by the reviewer's own rule. The 200,000-byte probe is still dropped, because 65,537 already proves the rule and the probe adds only flake risk on other kernels. | harness |
| HR-04 | nit | Agreed: column order is unobservable. | Accepted: compare columns as a set. | harness |
| HR-05 | nit | Agreed. | Accepted: wrap create and click inside the day-change retry; anchor the gray-box seed; add a retry to the stats-page tests. | harness |
| HR-06 | nit | Agreed. | Accepted: `unpipe()` both directions in blackhole mode. | harness |
| HR-07 | nit | Agreed: exact `total` and absolute positions belong in the sequential suite. | Accepted: move the two list tests to the invariants suite. | harness |
| HR-08 | nit | Agreed. | Accepted: compare timestamps as instants. | harness |
| HR-09 | nit | Agreed. | **SPEC v1.2:** R-ERR-8 and R-REDIR-9 say "matched route". | coordinator |
| HR-10 | nit | Agreed. | **SPEC v1.2:** R-UI-4 is scoped to the create form; delete-failure reporting is unspecified. | coordinator |
| HR-11 | nit | Agreed. | Accepted: rename the test so it doesn't claim "migrations applied". | harness |
| HR-12 | nit | Agreed. | Accepted: fix stale "exactly" and "spec-v1" text. | harness |
| HR-13 | nit | Agreed. It only weakens the search, but that's still worth fixing. | Accepted: search both address families. | harness |
| HR-14 | nit | Agreed. Under the v1.1 scope, prefetch traffic is not captured, so `networkidle` isn't needed. | Accepted: wait for the form instead. | harness |
| HR-15 | nit | Agreed. | **SPEC v1.2:** routes match on the undecoded path, and `%2F` does not split a segment. | coordinator |
| HR-16 | nit | Agreed. This is already what the harness asserts. | **SPEC v1.2:** R-STATS-5 entries have at least 1 click. | coordinator |

Counted by script: 16 findings; 16 accepted (HR-03 downgraded to a nit but still fixed); 4 resolved in SPEC, 12 in the harness.
