# Harness run 5: update for spec-v1.1

Sent on 2026-10-18 via SendMessage to the run-4 harness author (agent `a1fa35d76a896a0d7`), which resumed from its own transcript. Its workspace was `tbv-ws/harness`, with `spec/` replaced by the `spec-v1.1` export and an identical copy of its sealed holdout restored to `holdout/`. The text below is verbatim.

---

Harness run 5: please update your suites for spec-v1.1, which resolves your proposals HP-01..19.

Same role, same rules, same workspace (/Users/matthewnelson/Workspace/tbv-ws/harness). You may read only spec/ and your own harness/, holdout/ and PROPOSALS.md there. Nothing else on disk, same as before.

What changed in your workspace:
- spec/SPEC.md and spec/openapi.json are now spec-v1.1. Diff them against your memory of spec-v1; every change answers one of your HPs.
- holdout/ is back in your workspace (an identical copy of what you delivered). It will be re-sealed after this run.

How your proposals were resolved (SPEC wins on wording):
- HP-01/02/03/04/08/11/12/13/16: the spec now adopts the interpretation your harness already uses. Check each against your tests and change nothing unless a test now disagrees with the SPEC text.
- HP-05: `/{code}` is percent-decoded once before lookup (R-REDIR-3: `GET /pct%2Dx` redirects for `pct-x`). NEW TESTS: GET and HEAD on a percent-encoded known code (302 to its URL; HEAD records no click); an encoded unknown code is a text/plain 404.
- HP-06: `%2e`/`%2E` counts as a dot in dot segments (R-ROUTE-2), and unmatched paths are 404 regardless of method. NEW TESTS: encoded and mixed dot segments (`%2e`, `.%2E`, `%2e%2e`, ...) under /api/ and /. They must never yield 200/302/405. Include `PUT /api/links/%2e%2e` → 404 not_found, and a case where decode-then-normalize would land on a real link (e.g. `/api/x/%2e%2e/links/{realcode}` and `/x/%2E%2E/{realcode}`) → 404.
- HP-07: new R-URL-5 normative row: a leading U+000B is valid → `https://example.com/x`, and it counts toward R-URL-3. NEW TESTS: that row, plus 2048 code points including a leading U+000B → 201 and 2049 → 422.
- HP-10: R-UI-12 is rescoped. Read the new wording. CHANGE the test: from activating Shorten until 1 s after the alert, there must be no document navigation and no request with a method other than GET/HEAD. Drop "zero requests of any kind".
- HP-09: R-UI-4 "anything else" and R-UI-5 empty state are labeled unverifiable. HP-14: R-HEALTH-2 is gray-box, and its migration clause is unverifiable. HP-15: R-HEALTH-3 is gray-box. Update COVERAGE.md labels to match.
- HP-17/18: openapi fixed (format uri removed; 405/404 behavior described in info.description). fuzz.mjs may keep stripping format: uri from its derived copy.

Holdout: add variants for HP-05, HP-06 and HP-07 with DIFFERENT inputs from the public tests (other encodings, another C0 control such as U+0001 or U+001F, other dot-segment spellings). If the holdout has an R-UI-12 test, apply the HP-10 change there too. Keep the holdout roughly 25–30% of the public size.

Rules that still apply: titles start with requirement IDs; never weaken or delete an existing assertion except where the spec text now requires it (only HP-10). Re-run the self-check (nothing listening, plus Prism strict and lenient) at least on every changed or new test, and update SELF_CHECK.md. Every new test must fail against both. Any new spec problem goes in PROPOSALS.md as HP-20 onward. Don't edit spec/.

Final report: files changed; new or changed PUBLIC test titles; for the holdout, counts only, no titles or inputs; updated suite counts; self-check results; any deviations.
