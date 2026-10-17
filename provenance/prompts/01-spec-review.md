# Role: spec reviewer (adversarial)

**Workspace:** a directory containing only a copy of `spec/`. Nothing else exists yet.
**May read:** `spec/SPEC.md`, `spec/openapi.json`. **Writes:** `SPEC_REVIEW.md` in the workspace root.

You're reviewing a spec that will be frozen and then handed separately to a test author and an implementer, who will never talk to each other. Any ambiguity becomes a disagreement between them, and then either a false test failure or, worse, a bug the tests accept. Your job is to find those ambiguities before that happens.

Report every instance of the following:

1. **Ambiguity.** A rule where two implementations could both claim to conform yet behave observably differently. For each one, describe both behaviors concretely, such as a request and the two different responses.
2. **Contradiction.** Disagreements between `SPEC.md` and `openapi.json`, or between two rules.
3. **Untestable rules.** A rule that can't be checked black-box over HTTP or through the browser and isn't already labeled gray-box or mutant-verified. Say what would make it testable.
4. **Gaps.** Inputs or states the spec doesn't cover that a real client would hit. Examples: a trailing slash on `/{code}`, a `HEAD` request, Unicode in URLs, a stats request for a link created today with `days=1`.
5. **Hidden flakiness.** Rules whose tests would be timing-, clock- or order-dependent. Think about midnight UTC, the 2-second click-visibility window and concurrent tests sharing one database.

For each finding, give: the requirement ID (or "new"), a severity (`blocks testing` / `causes disagreement` / `minor`), the problem and a proposed rewording. Rank the list by severity. Don't comment on product choices, such as whether there should be auth. Only judge whether the spec is precise.
