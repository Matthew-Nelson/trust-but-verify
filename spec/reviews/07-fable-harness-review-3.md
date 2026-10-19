SIGN-OFF WITH NITS

# Harness review, round 3: post-freeze change `harness-v1` → `8ba4d0b` against `spec-v1.4`

Reviewer: the same blind reviewer as rounds 1 and 2. Static review only. Read: `spec-v1.3-to-v1.4.diff`, `spec/SPEC.md` (v1.4), `spec/PROPOSALS.md` (HP-23..26), `spec/reviews/05-disposition.md` and `06-disposition.md`, the complete `harness-v1-to-8ba4d0b.diff` (11 files), and the current `scripts/fuzz.mjs`, `fuzz/no_redirects.py`, `fuzz/schemathesis.toml`, `scripts/fuzz-stub.mjs`, `.gitignore` and `package.json` in full. I saw no implementation, output or report.

**Summary.** The three fixes are each the narrowest change that resolves its contradiction, and none weakens any check for any other input. The two new Fuzzing sentences and the "canonical form" definition are sound and consistent with the rest of SPEC; neither loosens R-OAS-1 beyond what R-ERR-3 and R-REDIR-1 already required. The diff touches no other test, assertion, timeout or check; COVERAGE, SELF_CHECK and README agree with the code; `fuzz-stub.mjs` is not wired into any suite. I agree with "no spec change" for HP-26. Four nits, none of which a conforming implementation could fail on or a broken one could pass on.

---

## 1. The spec-v1.4 changes

**Fuzzing, sentence 1 (HP-24).** "Generation never adds parameters the schema doesn't define, because R-ERR-3 and 'Query integer' require undefined parameters to be ignored, so no check may treat accepting one as a failure." Sound and the narrowest resolution available: it scopes *generation*, not the check, so `negative_data_rejection` still fires on every schema-violating value of a *defined* parameter (`limit=0`, `offset=-1`, `days=abc`, non-string `url`, …). It is consistent with R-ERR-3 ("Parameters an endpoint doesn't define are ignored"), with the R-ERR-3 black-box tests (`foo=bar&days=abc&limit=7` → 200; `limit=abc&offset=-1&days=0` on `GET /api/links/{code}` → 200), and with R-LINK-8. The one thing it gives up is that the fuzzer no longer sends undefined parameters at all, so `not_a_server_error` on such inputs is no longer exercised by fuzz; that is covered by the R-ERR-3 tests, so R-OAS-1 is not loosened beyond the contradiction.

**Fuzzing, sentence 2 (HP-25).** "It does not follow redirects: a 3xx is recorded and checked as the operation's response, never followed and never counted as an error." Sound, unambiguous, and exactly what R-REDIR-1 plus the documented 302 in `openapi.json` already implied. It does not loosen R-OAS-1: a 3xx is still subject to `status_code_conformance` (an undocumented 301 on `/{code}`, or a 302 on any `/api/` operation, still fails) and to the header/content checks the schema defines.

**R-PRIV-1 "canonical form" (HR2-02).** "The client address exactly as the api's socket observes it, with an IPv4-mapped IPv6 address taken in its plain IPv4 form." Clear enough to apply, and the harness's `canonicalForms` satisfies it. One wording nit (HR3-01): "taken in its plain IPv4 form" can be read as *replacing* the mapped form, whereas `canonicalForms('::ffff:127.0.0.1')` returns both `127.0.0.1` and `::ffff:127.0.0.1`. The harness is therefore stricter than SPEC in one absurd configuration (a `DATABASE_URL` host written as `::ffff:127.0.0.1`), and stricter only in the safe direction: it skips as inconclusive where SPEC would let the search run. No behaviour change for any realistic run.

**Status line.** Now correctly describes v1.2 as three clarifications plus one resolved ambiguity (my HR2-01) and states that v1.4 changes no rule about api behaviour. True: both fuzzing sentences resolve the Verification rules toward rules that were already normative and already tested.

## 2. Each harness change is the narrowest fix

**HP-23, R-UI-1** (`tests/ui/home.spec.ts:30-34`). `expect(c.required).toBe(false)` → `expect(c.required, …).not.toBe(true)`. For `<input required>`, `<select required>` and `<textarea required>` the property is boolean `true`, so the assertion still fails them; `<button>`, `<fieldset>`, `<output>` and `<object>` read `undefined` and pass, as SPEC allows (R-UI-1 forbids `required`, and those elements cannot carry it). The `type !== 'url'` check, the `noValidate` check and the same-form check are untouched. Narrowest possible change.

**HP-24, undefined parameters** (`fuzz/schemathesis.toml:8-12`, loaded by `scripts/fuzz.mjs:52-54`). `[generation] allow-extra-parameters = false` is the only generation setting. `--checks all --exclude-checks positive_data_acceptance` is unchanged (`fuzz.mjs:56-57`), so `negative_data_rejection` remains enabled for everything else; SELF_CHECK run 10 shows it still reporting `offset=9223372036854776001` against the stub, and 0 requests with `x-schemathesis-unknown-property` versus 2 with the default. Narrowest: no check is excluded.

**HP-25, redirects** (`fuzz/no_redirects.py`, `scripts/fuzz.mjs:52-81`). Two layers, both needed:

- `before_call` sets `allow_redirects=False` on every generated request, so the 302 itself is the response Schemathesis records and checks. Every 3xx is *validated*, not skipped: with `allow_redirects=False` requests returns the 302 as `r`, and Schemathesis runs the normal checks on it (status code against the documented 302 for `GET`/`HEAD /{code}`; undocumented 3xx anywhere else fails; content-type/schema where the schema defines content). SELF_CHECK's stub evidence is consistent: 1,800 requests, 0 network errors, and the deliberate `/healthz` schema violation still caught in the same run.
- `requests.Session.resolve_redirects` replaced by a generator that yields nothing. I traced requests' `Session.send`: with `allow_redirects=True` it does `history = [resp for resp in self.resolve_redirects(...)]`, which is now empty, so nothing is followed; with `allow_redirects=False` it calls `next(self.resolve_redirects(..., yield_requests=True))` only to fill `r.next`, which now raises `StopIteration` and is swallowed. The replacement's signature `(self, resp, req, **kwargs)` accepts both call forms. This is also why `--max-redirects 0` had to go: requests' real `resolve_redirects` raises `TooManyRedirects` when `len(resp.history) >= max_redirects` *before* yielding, i.e. even when nothing is followed, which is precisely the HP-25 error. With the patch in place `max_redirects` is never consulted, so dropping the flag does not reintroduce following. Schemathesis's start-up probes use a plain `requests` session outside the hook path, which the process-wide patch covers (HP-26); SELF_CHECK reports a 0-request sink including the probe.

  Can anything still follow a redirect or reach an external host? Not through requests/urllib3 (requests passes `redirect=False` to urllib3 and does all following in `resolve_redirects`). No ASGI/WSGI transport is used. The only remaining way to leave `FUZZ_API` is an operator proxy environment variable (HR3-02), which is not a redirect and predates this change.

**Config and cwd handling.** `--config-file <absolute path>` is passed explicitly, before `run` (SELF_CHECK shows this invocation executing). `spawnSync` runs with `cwd: root` (= `harness/`), so the config's relative `hooks = "fuzz/no_redirects.py"` resolves to the committed file; `.gitignore` gaining `fuzz/__pycache__/` is consistent with that file having been imported from that path. `SCHEMATHESIS_HOOKS` is blanked to the empty string, which Schemathesis treats as unset (the run completed with the committed hook active). No `--hooks` flag. The only `schemathesis.toml` in the workspace is the committed one. What I cannot rule out statically is auto-discovery of a `schemathesis.toml` or `pyproject.toml` in a *parent* directory of `harness/` on the operator's machine being merged with the explicit file; see "What to run" for a two-minute test.

## 3. Nothing else moved

The diff touches exactly: `.gitignore` (+1 ignore line), `COVERAGE.md` (spec tag in the header, R-OAS-1 row text), `README.md` (fuzz row, layout, tag), `SELF_CHECK.md` (run-10 note), `fuzz/no_redirects.py` (new), `fuzz/schemathesis.toml` (new), `package.json` (description only), `scripts/coverage.mjs` (spec-tag detection, R-OAS-1 strings), `scripts/fuzz-stub.mjs` (new), `scripts/fuzz.mjs` (config file, cwd, flag removal, summary text), `tests/ui/home.spec.ts` (the one assertion). No other test, assertion, timeout, retry or check changed; `vitest.*.config.ts`, `playwright.config.ts`, `lib/` and every other test file are untouched. `fuzz-stub.mjs` appears in no `package.json` script, no Vitest `include` (`tests/**`), no Playwright `testDir`, and is not referenced by `run-holdout.mjs`; it is documented as self-check tooling only. `coverage.mjs`'s new `specTag` picks the numerically highest `spec-vX.Y` in the Status line (`spec-v1.4`), matching the regenerated COVERAGE header; the R-OAS-1 title and note in COVERAGE match `coverage.mjs`. SELF_CHECK's claims are consistent with the code (the flag is gone, the config and hook exist, suite counts unchanged at 372/8/35).

## 4. HP-26

Agree with "no spec change". "It does not follow redirects" is a statement about the fuzz run as a whole; the v1.4 sentence adds "never followed" with no carve-out, so a probe following a 302 would already violate it. The harness now meets the rule for probes too. Adding "including any requests the tool sends on its own" at the next revision is cheap and worth doing, but it is not needed for the rule to be binding or for this sign-off.

---

## Findings

### HR3-01 — nit — SPEC R-PRIV-1 (v1.4) and `lib/addr.ts:18-20` — "taken in its plain IPv4 form"

The definition reads as if the canonical form of `::ffff:127.0.0.1` is `127.0.0.1` only; the harness treats both the mapped and the plain form as canonical. The only observable difference is with a `DATABASE_URL` host literally written `::ffff:127.0.0.1` and a dual-stack client socket, where the harness skips as inconclusive and SPEC would search `127.0.0.1`. Safe direction, no realistic run affected. **Fix:** "(the client address exactly as the api's socket observes it and, for an IPv4-mapped IPv6 address, also its plain IPv4 form)".

### HR3-02 — nit — `scripts/fuzz.mjs:81` — proxy environment variables can route the fuzz run off-host

`spawnSync` passes the caller's environment through (only `SCHEMATHESIS_HOOKS` is blanked). `requests` honours `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` and does not bypass them for `localhost` unless `NO_PROXY` says so. On a machine with a corporate proxy configured, every fuzz request to `FUZZ_API` would go to the proxy host. This is not a redirect and predates this change; the Vitest suites (Node `fetch`) are unaffected. **Fix:** in the spawn env, delete `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY` and their lowercase forms, or set `NO_PROXY='*'`, and note it in README.

### HR3-03 — nit — `COVERAGE.md` R-UI-12 note / `scripts/coverage.mjs` NOTES — stale version citation

HR2-04 was resolved for README and package.json, but the R-UI-12 note still says "Per SPEC v1.1 the capture runs…". The method is from v1.1 and still accurate, so this is cosmetic. **Fix:** cite v1.4 (or drop the version).

### HR3-04 — nit — two mechanisms I could only verify from SELF_CHECK's evidence, not from the code

(a) That Schemathesis 4.29.1 accepts `hooks` as a *file path* relative to cwd (rather than an importable module name), and (b) that the config key is spelled `allow-extra-parameters`. Both are supported by SELF_CHECK run 10 (a hook that was never loaded could not have stopped the probe from following the 302 to the sink; a misspelled key could not have reduced the `x-schemathesis-unknown-property` requests from 2 to 0) and by the new `fuzz/__pycache__/` ignore, but a reviewer reading only the code cannot confirm them. **Fix:** none needed if the run below reproduces; otherwise use the module-name form.

---

## What to run (the coordinator can do this; each is a few minutes)

1. **Reproduce the stub run, which settles HR3-04 and confirms both layers:** `node scripts/fuzz-stub.mjs 4020 4021 results/fuzz-stub.log &` then `FUZZ_API=http://127.0.0.1:4020 pnpm fuzz`; expect 0 network errors, 0 `SINK-FOLLOWED` lines, 0 `x-schemathesis-unknown-property` in the log, and the `/healthz` schema failure still reported.
2. **Stray-config test:** create a temporary directory *above* a copy of `harness/` containing a decoy `schemathesis.toml` with `hooks = "decoy.py"` where `decoy.py` writes a marker file at import; run `pnpm fuzz` against the stub; the marker must not appear. Also run once with `SCHEMATHESIS_HOOKS=decoy` exported in the shell; the marker must still not appear.
3. **HR3-02:** export `HTTP_PROXY=http://127.0.0.1:9` and run `pnpm fuzz` against the stub; if every request fails with a connection error, the proxy variable is honoured and the env should be scrubbed.
4. **R-UI-1:** a page whose form has `<button>Shorten</button>` plus a `<textarea required>` must still fail `[R-UI-1] form has …`; a page with `<button>` and no `required` anywhere must pass it.

## What I checked

Every hunk of the diff against its proposal and against SPEC v1.4; the three new files in full; requests' `Session.send`/`resolve_redirects` control flow for both `allow_redirects` values; that `max_redirects` is unreachable after the patch; that every remaining Schemathesis check still runs on a 3xx; that `negative_data_rejection` is still enabled; that the toml contains only the one generation key and the hook path; cwd and `--config-file` handling in `fuzz.mjs`; that `fuzz-stub.mjs` is reachable from no script or suite; the `specTag` logic in `coverage.mjs` against the Status line; that no other test, assertion, timeout or config changed; and that README, COVERAGE and SELF_CHECK describe the code as it is.

Not checkable statically: the two Schemathesis mechanics in HR3-04; whether an explicit `--config-file` fully suppresses auto-discovery (run 2 above); the holdout, which the disposition says is untouched.
