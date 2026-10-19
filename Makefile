# Reproduces the verification evidence from a clean clone.
#
# Needs: rustup (the toolchain is pinned in impls/api/rust-toolchain.toml), Node 22 + pnpm, uv (for
# Schemathesis via uvx), cargo-audit, and a reachable Postgres on localhost:5432 whose PGUSER
# (default: your login name) can create databases without a password prompt.
# No HTTP(S)_PROXY / ALL_PROXY may be set (tools/lib.mjs refuses to run).
#
# Three tiers (see .github/workflows/verify.yml):
#   make acceptance  every push: every suite once against a fresh build    (~8 min)
#   make nightly     acceptance x3 on fresh databases (flakiness), plus the mutant run when
#                    harness/, holdout/ or mutants/ changed in the last day
#   make verify      per release: the full evidence pipeline and report    (~1-1.5 h)
#
#   make setup       install harness + web dependencies and the Playwright browser
#   make checks      static and implementer checks       -> reports/raw/checks.json
#   make mutants     clean baselines x3 + every mutant   -> reports/raw/mutants/$(ROUND)/
#   make trace       traceability matrix                 -> reports/raw/trace.json
#   make report      reports/VERIFICATION.md and .html

ROUND ?= run-0
BASELINES ?= 3

.PHONY: verify acceptance nightly setup checks mutants trace report clean-work

verify: setup checks mutants trace report

acceptance: setup checks
	node tools/acceptance.mjs

nightly: setup
	node tools/acceptance.mjs --repeat 3 --out reports/raw/acceptance-nightly
	@if [ -n "$$(git log --since='25 hours ago' --format=%h -- harness holdout mutants)" ]; then \
	  echo "harness/holdout/mutants changed in the last day: running the mutant run"; \
	  $(MAKE) mutants ROUND=nightly; \
	else echo "no harness/holdout/mutants change in the last day: mutant run skipped"; fi

setup:
	cd harness && CI=true pnpm install --frozen-lockfile && pnpm setup:ui
	cd impls/web && CI=true pnpm install --frozen-lockfile

checks:
	node tools/checks.mjs

mutants:
	node tools/mutate.mjs --baseline $(BASELINES) --out reports/raw/mutants/$(ROUND)

# Requirement status comes from the newest round's clean baselines; mutant verdicts from every round
# (the newest verdict per mutant wins).
LATEST = $(lastword $(sort $(wildcard reports/raw/mutants/run-*)))

trace:
	node tools/trace.mjs --runs $(LATEST) $(foreach d,$(sort $(wildcard reports/raw/mutants/run-*)),--mutants $(d))

report:
	node tools/report.mjs

clean-work:
	git worktree remove --force .work/mutant-wt 2>/dev/null || true
	rm -rf .work
