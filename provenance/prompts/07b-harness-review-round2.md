# Harness review, round 2

Sent on 2026-10-18 via SendMessage to the round-1 reviewer (Fable, resumed). The workspace was refreshed to `spec-v1.3`, harness `6ff8513`, the dispositions and the two diffs, and the round-1 report was renamed. Verbatim:

---

Round 2 of your harness review: the fixes for your BLOCK are in, and I need a fresh verdict.

Same role, same rules: read only inside /Users/matthewnelson/Workspace/tbv-ws/harness-review, no web access, and write only HARNESS_REVIEW_2.md at the workspace root. Your round-1 report is now HARNESS_REVIEW.round1.md.

What's in the workspace now:
- spec/ is at spec-v1.3. spec/v1.1-to-v1.3.diff shows every SPEC/openapi change since you last reviewed: v1.2 (your HR-09, HR-10, HR-15, HR-16, as wording) and v1.3 (HP-21: the R-PRIV-1 database-host exclusion, with an "inconclusive, never passed" guard; HP-22: R-UI-12 scope note).
- spec/reviews/04-disposition.md shows how each of your findings was resolved and how the coordinator checked them. HR-03 was tested against a real axum server and didn't reproduce, but the probe was dropped anyway.
- harness/ is the public suite at commit 6ff8513. harness-f6d203e-to-6ff8513.diff is the full diff from the version you reviewed.

Please check:
1. Each HR fix actually resolves its finding, without weakening anything else.
2. The v1.2 and v1.3 SPEC changes are sound, unambiguous, and consistent with the rest of SPEC. Note that they change the text Matthew originally signed.
3. Anything new the fixes introduced: false failures, false passes, or dishonest reporting. Look closely at the R-PRIV-1 exclusion and inconclusive logic (lib/addr.ts canonicalForms, spawned.graybox.test.ts), the tests moved into the invariants suite, the new %2F tests, and the midnight retries.
4. Anything from round 1 you'd now rate differently.

Same verdict rules and format as round 1: the first line is exactly SIGN-OFF, SIGN-OFF WITH NITS, or BLOCK; then findings numbered HR2-01 onward, each with severity, IDs, location, failure scenario and fix. Matthew's rule still stands: if you sign off, he signs off.

When done, reply with the verdict line, the counts, and a one-line summary of any blocking finding.
