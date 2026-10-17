# Provenance log

One row per agent run. "Could see" describes the workspace actually given to the agent, not just what its prompt said.

| # | Date | Phase | Role | Model | Workspace / could see | Could not see | Output (commits / tag) | Transcript |
|---|---|---|---|---|---|---|---|---|
| 0 | 2026-10-17 | spec | coordinator | claude-opus-5-5 | everything (old repos for context) | — | spec draft, METHOD, prompts | this session |

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
