# Disposition of harness review round 2 (HR2-01..05)

**Review:** `05-fable-harness-review-2.md`, the same blind Fable reviewer, working from `spec-v1.3` and harness `6ff8513`. Verdict: **SIGN-OFF WITH NITS** (0 blocking, 5 nits).
**Sign-off:** Matthew's delegated rule ("If they give signoff then i approve as well") is met, so `harness-v1` is tagged at the reviewed commit. The reviewed harness files are tagged byte for byte: none of these nits is fixed in `harness/` before the tag.

| ID | Coordinator check | Resolution |
|---|---|---|
| HR2-01 | Agreed. The `spec-v1.2` Status line and the v1.2 rows of `04-disposition.md` say "no behavior change", but the R-ROUTE-2 `%2F` sentence settled a real ambiguity: a decode-then-route implementation was defensible before and fails two public tests after. | **Record corrected here and told to Matthew directly:** v1.2 is three clarifications plus one resolved ambiguity (R-ROUTE-2 `%2F`, now tested). The frozen SPEC text is unchanged; the Status line will be corrected at the next spec revision. |
| HR2-02 | Agreed. | Deferred to the next spec revision. Until then, the harness definition in `lib/addr.ts` `canonicalForms` is authoritative: the plain address as observed on the socket, plus its unmapped IPv4 form. |
| HR2-03 | Agreed. It is unusual, and it can only cause a false failure, never a false pass. | Listed under "what this does not prove" in the verification report. `06-verify` requires a `DATABASE_URL` host whose *resolved* address differs from the client address, and any R-PRIV-1 log-search failure to be checked for this cause before it's reported. |
| HR2-04 | Agreed. | Known stale strings (`harness/README.md`, `harness/package.json`, a COVERAGE note), left as is so the tag matches the reviewed bytes. To be fixed at the next harness change. |
| HR2-05 | **Tested by the coordinator.** A throwaway test in the harness workspace (not the repo) with `ctx.annotate(...)` plus a mid-test `ctx.skip(note)`, and a conditional `ctx.skip(true, note)`. Vitest 4.1.11's JSON reporter recorded both as `status: "skipped"` with `meta: {}`. **Notes and annotations are not in the JSON report.** | `06-verify`: the `trace` tool collects results with a custom Vitest reporter that reads each test's skip note and annotations. The report build fails if a gray-box skip has no recognized prefix (`pending (gray-box):`, `gray-box: DATABASE_URL is unset`, `inconclusive (gray-box):`). No harness change. |

Counted: 5 nits; 0 blocking; 5 accepted (1 recorded, 1 deferred to SPEC, 2 handled in phase 6, 1 deferred to the next harness change).
