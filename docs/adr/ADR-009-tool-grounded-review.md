# ADR-009 — Tool-Grounded Review

**Status:** Accepted  
**Date:** 2026-10-01

## Context

`pr-analyst` and `code-reviewer` judged a change by reading the diff. They saw no conventions or history beyond what the command passed in, and they never executed anything. Two consequences:

- A verdict could be `DONE` while the test suite, linter or type-checker was red — the reviewer had no way to know.
- Builder evidence from the typed-evidence chain (`### Reproduction`, `### Non-regression evidence`) was trusted as written, never verified.

The sister repo [`autonomous-dev-loop`](https://github.com/koydas/autonomous-dev-loop) documented the same failure mode on its single-shot LLM reviewer (its ADR-0019): a diff with an undeclared dependency, a read-only property assignment and no tests was `APPROVED`.

Both agents run inside Claude Code, which already has file, search and shell tools. The gap is in the agent definitions, not in the runtime.

## Decision

Both reviewer agents follow a three-step procedure before producing a verdict:

1. **Gather context**, bounded to the touched files: nearest `CLAUDE.md` / `AGENTS.md`, governing ADRs, `git log` of each touched file, callers of changed exported symbols.
2. **Run checks** discovered from the repo itself (`CLAUDE.md`, CI workflows, manifests) — tests, lint, type-check, declared scans — and re-execute the builder's typed evidence. Commands are never invented and their source is recorded.
3. **Analyze and loop**: investigate each failure; re-run a check at most once, only to confirm a hypothesis.

The result is a mandatory **Evidence** table (`PASS` / `FAIL` / `N/A` / `NOT_RUN` / `PRE_EXISTING`, with command and source). `DONE` requires every row to be `PASS`, `N/A` or `PRE_EXISTING`.

`PRE_EXISTING` marks a failure that the base branch's CI already had. It stays visible in the report but does not block: a red base must not hold every PR hostage, and silently ignoring it would hide it from the human gate. The proof comes from the command, not the agent (ADR-007: scripts own external I/O):

- The base is the **merge-base** of HEAD with the base branch (`origin/<baseRefName>` for `/pr-review`, the default branch from `configs/git.yaml` otherwise) — the commit the change actually diverged from, not the moving tip.
- `scripts/gh-get-check-runs.mjs --merge-base [<ref>]` resolves it with `git merge-base` and returns that commit's check runs (`{ sha, check_runs: [{ name, status, conclusion, html_url }] }`). The four review commands pass it to the agent as input.
- The agent marks a row `PRE_EXISTING` only when a check run in that input runs the same check and concluded `failure` / `timed_out`, citing its URL. Without the input, without a matching run, or in doubt: `FAIL`. The agent never calls GitHub and never checks out the base.

Safety boundaries:

- Checks run only when the working tree already reflects the change under review — for `pr-analyst`, HEAD equals the PR head SHA and `git status --porcelain` is empty; for `code-reviewer`, the builder's files are on disk (tracked or untracked). The agent never checks out, stashes, resets or cleans — that would silently mutate the developer's tree.
- Builders (`code-builder*`) write their patch to the working tree, uncommitted, which makes the `code-reviewer` precondition explicit rather than implied.
- Each check is bounded by the CI job's `timeout-minutes`, else 10 minutes; a timeout is `NOT_RUN`.
- Side-effect free commands only: no lockfile-rewriting install, no migration against a real database, no deploy, no network write, no git mutation.
- Fork PRs (`isCrossRepository`): the `/pr-review` command asks the user and passes the answer to `pr-analyst`. Subagents cannot prompt the user, and gates belong to the pipeline (ADR-001); without an explicit approval the agent executes nothing (`NOT_RUN`).

`scripts/gh-get-pr.mjs` now also fetches `headRefOid` and `isCrossRepository` to support these checks; `scripts/gh-get-check-runs.mjs` provides the base CI results. `/pr-review` only asks the fork question when the PR is checked out — otherwise nothing would run.

## Consequences

**Positive**
- A `DONE` verdict implies the repo's own checks passed on the reviewed code
- Typed builder evidence becomes verified evidence, not claims
- The report shows exactly what was and was not executed, so the human gate (ADR-001) decides with full information

**Negative**
- Review latency and token cost increase by the duration of the test suite
- `/pr-review <n>` on a PR that is not checked out yields `NOT_RUN` rows and therefore `NEEDS_REVIEW` — deliberate, but it requires a checkout for a clean verdict
- The same happens on the PR head with local edits or untracked files (`NOT_RUN — working tree is dirty`): running `/pr-review` from a working branch with uncommitted changes never yields `DONE`
- `PRE_EXISTING` depends on the base branch having CI results for the merge-base commit; without them a pre-existing failure is reported as `FAIL`
- Command discovery depends on the repo documenting its checks; an undocumented repo gets `N/A` rows and weaker grounding
- The "fails before the fix" half of a bug reproduction is not re-verified — it would require reverting the fix in the working tree

## Alternatives considered

- **Pass the change's CI results in from the command** (instead of running checks locally) — cheaper, but CI may not have run on local changes (`/issue-code-generation`, `/ac-check`), and it keeps the reviewer from investigating failures. Rejected for the change itself. The **base** branch's CI results *are* passed in from the command: they only serve to classify a local failure as `PRE_EXISTING`, and fetching them is external I/O the agent must not do
- **Let the agent check out the PR itself** — rejected: mutates the developer's working tree without an explicit gate
- **Separate verifier agent before the reviewer** — rejected for now: adds a pipeline stage to every command for logic that is inseparable from the review judgement (deciding whether a failure is blocking)
