# Harness run 7: R-PRIV-1 inconclusive guard

Sent on 2026-10-18 via SendMessage to the harness author (agent `a1fa35d76a896a0d7`, resumed), with `spec/` replaced by the `spec-v1.3` export. Verbatim:

---

Harness run 7: one small change for spec-v1.3, which resolves your HP-21 and HP-22.

Same role, rules and workspace. spec/ is now spec-v1.3. Read the changed R-PRIV-1 and R-UI-12 text.

The problem with HP-21 as implemented: if DATABASE_URL's host is 127.0.0.1 and the client connects from 127.0.0.1, your exclusion drops the plain "127.0.0.1" form. The R-PRIV-1 log search then passes while missing the most likely leak, which is a false pass.

Change: in the spawned-instance R-PRIV-1 log test, if the exclusion removes the client address's canonical form (the plain textual address the api would see), the test must not pass. Skip it at runtime with a note starting `inconclusive (gray-box):` that names the client address and the excluded forms, plus the remedy (name the database host differently, e.g. localhost). Keep all other behavior. Apply the same rule to any other search that excludes forms, and to the holdout if it has such a search. Update COVERAGE.md (regenerate), README.md (document the inconclusive skip and recommend a hostname in DATABASE_URL) and SELF_CHECK.md (add a short run-7 note). Type-check, and confirm the test still skips cleanly without DATABASE_URL/API_BIN.

HP-22 needs no harness change.

Report briefly: the diff summary, and what the test does in each case: no exclusion, a non-canonical form excluded, the canonical form excluded.
