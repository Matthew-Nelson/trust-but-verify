# Disposition of gap-round proposals HP-27..30

**Source:** gap round 1 (run 12). A fresh Opus harness author worked from `spec-v1.4` and the public harness only. It was asked to close the three behaviors that survived mutant round 0 (#24 R-ERR-7; #26 and #27 R-REDIR-6), described in spec terms. It found that the `spec-v1.4` gray-box contract does not let the harness cause an internal error or a click-recording failure deliberately and safely. It wrote two fault-injection tests anyway, gated on these proposals.
**Decision:** Matthew chose "Adopt HP-27/28/29" in session. HP-30 is declined.

| ID | Resolution | Note |
|---|---|---|
| HP-27 | **Adopted verbatim.** API_BIN instances may be used for the R-ERR-7 and R-REDIR-6 fault-injection tests; both labels gain "also gray-box". | Verification method only. |
| HP-28 | **Adopted verbatim.** New "Fault injection" bullet: a harness-owned PostgreSQL wire-protocol proxy declines TLS and may run `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` and `SET search_path TO ''` on the spawned instance's idle sessions. | **One implementation-facing sentence:** "An instance must accept an unencrypted connection when its `DATABASE_URL` does not require encryption." That is the default behavior of mainstream Postgres clients (libpq and sqlx `sslmode=prefer`). It is stated so that a failure to connect through the proxy reads as non-conformance rather than an inconclusive test. It was adopted knowing that it binds the implementation. |
| HP-29 | **Adopted verbatim.** R-REDIR-6 now defines normal latency: B is the slowest of ≥10 normal GETs and ≥10 interleaved HEADs; each faulted GET answers within max(4 × B, B + 1 s), with status, `Location` and `Cache-Control` equal to the normal redirect's. | It makes an existing rule measurable. Any retry or backoff lasting seconds exceeds the bound when B < ~1 s. |
| HP-30 | **Declined.** It would add an api rule (a database-rejected statement under `/api/` must be a 500) after the implementation was frozen. | Consequence: on an api that answers such failures with a non-500 status, the R-ERR-7 test reports **inconclusive** (pending), never passed. |

**What happens next:** the gap author removes the proposal gate so the tests run by default, and the blind harness reviewer checks the gap-round diff (round 4). After that, `harness-v1.2` is tagged, and mutant round 1 re-runs all 37 mutants with fresh baselines. The holdout is unchanged.

**The risk being managed:** these tests were written after round 0, with knowledge that the three behaviors survived. The guard is that the author saw only spec-level descriptions (`provenance/prompts/02f-gap-round-1.md`), never the patches, the red team's trigger notes or the implementation. The tests are also written from the requirement text: any non-identical redirect, any multi-second delay, any non-canonical 500.
