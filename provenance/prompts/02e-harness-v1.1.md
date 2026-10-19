# Harness run 10: three post-freeze fixes for spec-v1.4

Sent on 2026-10-18 via SendMessage to the harness author (agent `a1fa35d76a896a0d7`), resumed from its own transcript. Workspace `tbv-ws/harness`, with `spec/` replaced by the `spec-v1.4` export. The holdout is not in the workspace and is not part of this run. The text below is verbatim.

---

Harness run 10: three narrow fixes to the frozen public harness, for spec-v1.4.

Same role, same rules, same workspace (/Users/matthewnelson/Workspace/tbv-ws/harness). You may read only spec/ and your own harness/ and PROPOSALS.md there. Nothing else on disk. The holdout is not part of this run, and it isn't in your workspace.

Context: your public harness was frozen and signed off as harness-v1. Since then, independent implementations were built against it. Running it found three places where a **conforming** implementation cannot pass. Each one follows from the SPEC text alone, so I'm giving you the SPEC reasoning, not anything about the implementations. You won't see their code or output, and you shouldn't need to.

spec/SPEC.md is now spec-v1.4. Its only changes are in the Status line, R-PRIV-1 (the "canonical form" definition, which already matches your `canonicalForms`), and "Verification rules / Fuzzing". Read the new Fuzzing paragraph first.

Fixes:

1. **HP-23, R-UI-1 (tests/ui/home.spec.ts, the `[R-UI-1] form has ...` test).** It asserts `required === false` on every entry in `form.elements`. `HTMLButtonElement` (also `fieldset`, `output`, `object`) has no `required` property, so a form whose Shorten control is a `<button>` reads `undefined` and fails, though SPEC allows a button. Change it so a control fails only when `required` is `true`, or check only `input`, `select` and `textarea`. Keep the `type !== 'url'` and `noValidate` checks as they are.

2. **HP-24, R-OAS-1 / R-ERR-3 (fuzz).** The old Fuzzing rule ran every check except `positive_data_acceptance`. In Schemathesis 4.29.1, `negative_data_rejection` treats an undefined query parameter (`?x-schemathesis-unknown-property=42`) as invalid input and expects a 4xx. R-ERR-3 and "Query integer" say undefined parameters are ignored, so a conforming api answers 200 and fails. spec-v1.4: "Generation never adds parameters the schema doesn't define." 4.29.1 has a config option for exactly this: `[generation] allow-extra-parameters = false` (see `schemathesis/config/_generation.py`). Use it, or an equivalent, so that `negative_data_rejection` **stays enabled** for every other kind of invalid input. Don't exclude the check.

3. **HP-25, R-OAS-1 / R-REDIR-1 (fuzz).** `scripts/fuzz.mjs` passes `--max-redirects 0`. With 4.29.1 (via `requests`), every 302 then raises "Network Error: Exceeded 0 redirects" on `GET`/`HEAD /{code}`, so no conforming api can pass once a code exists. spec-v1.4: "a 3xx is recorded and checked as the operation's response, never followed and never counted as an error." Make the run send requests without following redirects, so the 302 itself is validated against the schema (status, `Location`, headers). A `before_call` hook that sets `allow_redirects=False` is one route. The script currently blanks `SCHEMATHESIS_HOOKS`, so if you add a hook, load only your own committed hook file. The fuzz run must still never reach an external host. Verify that yourself: show that a 302 to an external URL is recorded and not followed (for example, a tiny local server that answers 302 to an unroutable or local-only address and logs any follow-up request).

4. **HR2-04 (housekeeping).** Update the stale `spec-v1.2` strings (README.md, package.json, the COVERAGE note) to `spec-v1.4`.

Rules that still apply: titles start with requirement IDs. Never weaken or delete an assertion except exactly as described above. Change nothing else: no other test, assertion, timeout or check. Self-check:
- **R-UI-1:** must still fail against nothing listening.
- **Fuzz:** run it against the Prism mock (strict) and record the result. Also run a small local stub that answers one operation with a schema-conforming 302 and another with a schema-violating response. The 302 must not error, and the violation must still fail. Report the commands and outcomes.

Update SELF_CHECK.md and COVERAGE.md if anything they say changes. Any new spec problem goes in PROPOSALS.md as HP-26 onward. Don't edit spec/.

Final report: files changed, with a short description of each diff; the exact new fuzz command line and any config or hook file; self-check results; suite counts (they should be unchanged); and any deviations.
