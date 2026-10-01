# ADR-009 — Tool-Grounded Review

**Status:** Accepted  
**Date:** 2026-10-01

## Context

`pr-analyst` and `code-reviewer` judged a change by reading the diff. They saw no conventions or history beyond what the command passed in, and they never executed anything. Two consequences:

- A verdict could be `DONE` while the test suite, linter or type-checker was red — the reviewer had no way to know.
- Builder evidence from the typed-evidence chain (`### Reproduction`, `### Non-regression evidence`) was trusted as written, never verified.

The sister repo `autonomous-dev-loop` documented the same failure mode on its single-shot LLM reviewer (its ADR-0019): a diff with an undeclared dependency, a read-only property assignment and no tests was `APPROVED`.

Both agents run inside Claude Code, which already has file, search and shell tools. The gap is in the agent definitions, not in the runtime.

## Decision

Both reviewer agents follow a three-step procedure before producing a verdict:

1. **Gather context**, bounded to the touched files: nearest `CLAUDE.md` / `AGENTS.md`, governing ADRs, `git log` of each touched file, callers of changed exported symbols.
2. **Run checks** discovered from the repo itself (`CLAUDE.md`, CI workflows, manifests) — tests, lint, type-check, declared scans — and re-execute the builder's typed evidence. Commands are never invented and their source is recorded.
3. **Analyze and loop**: investigate each failure; re-run a check at most once, only to confirm a hypothesis.

The result is a mandatory **Evidence** table (`PASS` / `FAIL` / `N/A` / `NOT_RUN`, with command and source). `DONE` requires every row to be `PASS` or `N/A`.

Safety boundaries:

- Checks run only when the working tree already reflects the change under review (PR head SHA for `pr-analyst`, applied diff for `code-reviewer`). The agent never checks out, stashes or resets — that would silently mutate the developer's tree.
- Side-effect free commands only: no lockfile-rewriting install, no migration against a real database, no deploy, no network write, no git mutation.
- Fork PRs (`isCrossRepository`) require user confirmation before executing anything from the branch.

`scripts/gh-get-pr.mjs` now also fetches `headRefOid` and `isCrossRepository` to support these checks.

## Consequences

**Positive**
- A `DONE` verdict implies the repo's own checks passed on the reviewed code
- Typed builder evidence becomes verified evidence, not claims
- The report shows exactly what was and was not executed, so the human gate (ADR-001) decides with full information

**Negative**
- Review latency and token cost increase by the duration of the test suite
- `/pr-review <n>` on a PR that is not checked out yields `NOT_RUN` rows and therefore `NEEDS_REVIEW` — deliberate, but it requires a checkout for a clean verdict
- Command discovery depends on the repo documenting its checks; an undocumented repo gets `N/A` rows and weaker grounding

## Alternatives considered

- **Pass CI results in from the command** — cheaper, but CI may not have run on local changes (`/issue-code-generation`, `/ac-check`), and it keeps the reviewer from investigating failures
- **Let the agent check out the PR itself** — rejected: mutates the developer's working tree without an explicit gate
- **Separate verifier agent before the reviewer** — rejected for now: adds a pipeline stage to every command for logic that is inseparable from the review judgement (deciding whether a failure is blocking)
