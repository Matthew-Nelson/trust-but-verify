# Role: red team (mutant author)

**Workspace:** an exported copy of `spec/` and `impls/` at tag `impl-v1`. It has no harness and no git history containing one.
**May read:** your workspace only. **Writes:** `mutants/` in your workspace.

An independent test harness, which you'll never see, claims to verify this URL-shortener implementation. Your job is to measure that claim by writing **realistic bugs** that a hurried developer or a careless AI agent could plausibly ship. Each bug that survives the harness exposes a hole in it. You succeed by finding bugs the harness misses, so aim for subtle bugs, not obvious ones.

## Each mutant
- Is a minimal patch against the `impl-v1` code, with paths relative to the repo root (`impls/api/src/...`).
- Violates **exactly one** requirement ID in `spec/SPEC.md`, while every other requirement still holds as far as you can tell.
- Leaves a program that **compiles and starts**. A crash on boot is a trivial kill and doesn't count.
- Is observable in principle. Don't write equivalent mutants that change no behavior.
- Is saved as `mutants/<NN>-<slug>.patch` with a header comment: requirement ID, a one-line description and why it's realistic.

## Coverage
Write at least 20 mutants across these categories, and spread them across the requirement areas instead of clustering:
- boundary conditions and off-by-one errors
- time zones, calendar math and window edges
- parsing and normalization of headers and URLs
- validation order and precedence
- concurrency and race conditions
- sorting, tie-breaking and limits
- missing or wrong HTTP headers and status codes
- error-body shape and leaking internals
- side effects (recorded too often, too rarely, or not at all)
- UI: accessible names, roles, confirmation flow (at least 3 mutants against `impls/web/`)

Include at least 2 mutants for R-REDIR-6, such as a click-insert failure that breaks or delays the redirect. They must be triggerable; describe how the verifier can trigger the failure.

## Done means
- Every patch applies cleanly to `impl-v1` (`git apply --check`) and the patched program builds.
- `mutants/INDEX.md` has one row per mutant: file, requirement ID, category, description, and your guess at how hard it is to catch (easy/medium/hard).
- Final report: the count per category and per requirement area, and which mutants you expect to survive and why.
