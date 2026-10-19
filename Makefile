# Reproduces the verification evidence from a clean clone.
#
# Needs: rustup (the toolchain is pinned in impls/api/rust-toolchain.toml), Node 22 + pnpm, uv (for
# Schemathesis via uvx), cargo-audit, and a reachable Postgres on localhost:5432 whose PGUSER
# (default: your login name) can create databases without a password prompt.
# No HTTP(S)_PROXY / ALL_PROXY may be set (tools/lib.mjs refuses to run).
#
#   make verify      everything below, in order
#   make setup       install harness + web dependencies and the Playwright browser
#   make checks      static and implementer checks       -> reports/raw/checks.json
#   make mutants     clean baselines x3 + every mutant   -> reports/raw/mutants/run-0/
#   make trace       traceability matrix                 -> reports/raw/trace.json
#   make report      reports/VERIFICATION.md and .html

ROUND ?= run-0
BASELINES ?= 3

.PHONY: verify setup checks mutants trace report clean-work

verify: setup checks mutants trace report

setup:
	cd harness && CI=true pnpm install --frozen-lockfile && pnpm setup:ui
	cd impls/web && CI=true pnpm install --frozen-lockfile

checks:
	node tools/checks.mjs

mutants:
	node tools/mutate.mjs --baseline $(BASELINES) --out reports/raw/mutants/$(ROUND)

trace:
	node tools/trace.mjs --runs reports/raw/mutants/run-0 $(foreach d,$(wildcard reports/raw/mutants/run-*),--mutants $(d))

report:
	node tools/report.mjs

clean-work:
	git worktree remove --force .work/mutant-wt 2>/dev/null || true
	rm -rf .work
