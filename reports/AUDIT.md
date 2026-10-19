## Isolation audit

**Method.** Every subagent transcript (JSONL) was parsed, and every tool call's input was checked:
- **Absolute paths:** each one was checked against an allowlist for the role (its workspace, package and browser caches, temp directories, system binaries).
- **Bash commands:** each one was also scanned for URLs, relative `cd` escapes, and references to the repo, other workspaces or holdout locations.
- **Positive control:** every audit counts the agent's references to its own workspace, so a zero for forbidden paths can't come from a broken scan.

Per-run details are in `provenance/LOG.md`.

**Consolidated holdout scan at reveal.** Every subagent transcript in the project was searched for holdout locations (`tbv-holdout*`, the `pre-run5/6/7` snapshots, coordinator holdout output, `/holdout/`). Only the harness author, which wrote the holdout, touched it. Every other role, including both spec reviewers, the harness reviewer, both implementers and the red team, has **0** holdout references.

| Role (run) | Model | Workspace | Result |
|---|---|---|---|
| Spec reviewers (1, 2) | Opus, Fable | spec only | clean |
| Harness author (4–7, 10) | Opus | spec only, plus public tool docs | clean. Run 10 fetched Schemathesis 4.29.1 source from GitHub with `curl` (public docs were in scope). |
| Harness reviewer (5b, 7b, 10b) | Fable | spec, dispositions, public harness | clean, with 0 holdout references. A prompt slip in run 5b named a repo path. The audit shows it was never accessed. |
| Api implementer (8) | Sonnet | worktree `impl-api` | clean, with 0 holdout references. It wrote one log to `/tmp/x` (self-reported). |
| Web implementer (9) | Sonnet | worktree `impl-web` | clean, with 0 holdout references |
| Red team (11) | Fable | spec plus an `impls/` export | clean: no harness, holdout or repo access, and no database connection |
| Gap-round harness author (12, 12b) | Opus (fresh) | spec plus public harness only | clean: no implementation, mutant, holdout or repo access; it re-read only its own saved tool outputs |
| Harness reviewer, round 4 (12c) | Fable | spec, dispositions, harness diff | clean |

**Incidents, all contained and logged:**
- **Shared scratchpad.** The coordinator's session scratchpad, which every subagent receives as its temp directory, held harness-workspace snapshots that included holdout copies. A re-audit showed that no agent listed or read them. They were moved to a coordinator-only directory before the round-3 review.
- **Real-api output in the author's workspace.** The coordinator once ran the fuzz suite against the real api from the harness author's workspace after that author had finished. The outputs were moved out right away and never imported or exported.
- **Shared tool-output directory.** Claude Code saves long tool outputs in a per-session directory that all agents in the session can read. A scan of every transcript found no agent reading a saved output it hadn't produced itself.
- **A harness detail in the frozen code.** The implementation itself mentions one harness detail (the R-UI-1 `required` check), and the red team could read it. It was left in, because mutants must apply to `impl-v1` exactly.

**Residual.** This audit shows what the agents *did*, not what they *could* have done. All roles ran on one machine with the same file permissions, so "didn't look" isn't "couldn't look". Every agent also received the same ambient context (a memory index line describing the project's goal).
