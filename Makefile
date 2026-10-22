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
#
# Committed rounds (run-0 is the first-shot record) are evidence and are never overwritten: by default
# a mutant run writes the next free run-N, so `make verify` from a clean clone adds a reproduction round.

NEXT_ROUND = run-$(words $(wildcard reports/raw/mutants/run-*))
ROUND ?= $(NEXT_ROUND)
BASELINES ?= 3

.PHONY: verify acceptance nightly setup checks mutants trace report clean-work

# Sub-makes, so trace and report see the round the mutant run just wrote (make caches directory listings).
verify: setup checks
	$(MAKE) mutants ROUND=$(NEXT_ROUND)
	$(MAKE) trace
	$(MAKE) report

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
	@case "$(ROUND)" in run-*) if [ -e reports/raw/mutants/$(ROUND)/results.json ]; then \
	  echo "reports/raw/mutants/$(ROUND) is a recorded round; pick another ROUND"; exit 1; fi ;; esac
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
