# Disposition of harness review round 3 (HR3-01..04)

**Review:** `07-fable-harness-review-3.md`, by the same blind Fable reviewer (rounds 1 and 2), working from `spec-v1.4` and harness `8ba4d0b` with the diff from `harness-v1`. Verdict: **SIGN-OFF WITH NITS** (0 blocking, 4 nits). HP-26: the reviewer agrees there is no spec change.
**Sign-off:** Matthew chose "Blind fix + re-review" (the blind author fixes, the blind reviewer checks the diff, then the coordinator tags `harness-v1.1`). The reviewer signed off, so `harness-v1.1` is tagged with harness files byte-identical to the reviewed `8ba4d0b`. None of these nits is fixed before the tag.

**Coordinator runs:** the reviewer proposed four runs. The coordinator ran all four on a copy of `8ba4d0b` in a coordinator-only directory, each with a positive control:

| Run | Result | Positive control |
|---|---|---|
| 1. Stub fuzz run | 1,800 requests, 99 of them on redirecting operations: 0 network errors, 0 sink hits, 0 `x-schemathesis-unknown-property`, and the `/healthz` schema violation still reported | A direct request to the sink logs `SINK-FOLLOWED` |
| 2. Stray config, and `SCHEMATHESIS_HOOKS=decoy` | Decoy hook not loaded in either case | The same decoy config loads (marker written) when passed explicitly with `--config-file` |
| 3. `HTTP_PROXY=http://127.0.0.1:9` | Every request fails with "Unable to connect to proxy"; the stub gets 0 requests. **HR3-02 confirmed.** | — |
| 4. R-UI-1 | `<button>` plus `<textarea required>` fails ("control of type textarea is required"); `<button>` with nothing required passes | — |

| ID | Coordinator check | Resolution |
|---|---|---|
| HR3-01 | Agreed. The harness is stricter, in the safe direction. | Next spec revision: "canonical forms: the address as the socket observes it, and, for an IPv4-mapped IPv6 address, also its plain IPv4 form." |
| HR3-02 | **Confirmed by run 3.** Fails closed on this machine (errors, never passes). No proxy variables are set in the coordinator's environment. | `06-verify`: verification runs assert that `HTTP(S)_PROXY`/`ALL_PROXY` (either case) are unset, and CI unsets them. Next harness change: scrub them in `fuzz.mjs`. |
| HR3-03 | Agreed, cosmetic. | Next harness change. |
| HR3-04 | **Settled by runs 1 and 2:** the hook loads by path (no sink hit, while the probe follows without it, per SELF_CHECK run 10) and the config key takes effect (0 undefined-parameter requests). | No change. |

Counted: 4 nits; 0 blocking; 1 settled, 1 deferred to SPEC, 1 handled in phase 6 and deferred to the harness, 1 deferred to the harness.
