# Provenance log

One row per agent run. "Could see" describes the workspace actually given to the agent, not just what its prompt said.

| # | Date | Phase | Role | Model | Workspace / could see | Could not see | Output (commits / tag) | Transcript |
|---|---|---|---|---|---|---|---|---|
| 0 | 2026-10-17 | spec | coordinator | claude-opus-5-5 | everything (old repos for context) | — | spec draft, METHOD, prompts (commit `60960c0`) | this session |
| 1 | 2026-10-17 | spec review | spec reviewer | Opus (fresh context, background subagent) | `tbv-ws/spec-review/spec/{SPEC.md,openapi.json}`, a copy of `60960c0` | repo, METHOD, prompts (by instruction; transcript to be audited) | `spec/reviews/01-opus-adversarial.md` (56 findings: 7 blocking, 33 disagreement, 16 minor), copied unmodified | subagent transcript (audited) |

**Deviation (run 1):** the plan assigned Fable 5.1 to spec review. Matthew chose Opus. The reviewer is therefore the same model family as the spec's author, which raises the risk of shared blind spots for this review. Mitigation: the harness author also reviews the spec in practice (it must interpret every rule), and its interpretations are reported.

**Isolation audit (run 1):** the tool calls in the transcript were `Read` ×2 (`spec/SPEC.md`, `spec/openapi.json` in the workspace), `Write` ×2 (`SPEC_REVIEW.md`) and the hand-back. No other files were opened. Caveat: like every Claude Code subagent, it also received context injected automatically by the harness (the user's memory index, environment info), which includes one line describing the project's goal. "Spec-only" therefore means spec-only *by tool access*, not a perfectly blank context. Method: grep of tool-use names and input paths in the transcript JSONL.

**Prompt for run 1:** `provenance/prompts/01-spec-review.md` verbatim, preceded by a header giving the workspace paths, the read restriction and the output location.

## Planned model assignment
Different models per role, so blind spots are less likely to line up:

| Role | Model |
|---|---|
| Coordinator / verifier | Opus 5.5 |
| Spec reviewer | Fable 5.1 |
| Harness author | Opus 5.5 (fresh context, spec-only workspace) |
| API implementer | Sonnet 5.5 |
| Web implementer | Sonnet 5.5 |
| Red team | Fable 5.1 |
