# /pr-review

Structured PR review with a written report, using the `pr-analyst` agent.

## Purpose

Produces a consistent, structured review for any PR — covering correctness, risks, test coverage, and AC coverage — and saves it to a file for reference or sharing.

## Invocation

```
/pr-review          # reviews the PR for the current branch
/pr-review 42       # reviews PR #42 of the current repository
/pr-review owner/repo#42
/pr-review https://github.com/owner/repo/pull/42
```

With `owner/repo#42` or a URL, every script receives `--repo owner/repo`, so the PR can belong to another repository than the working directory. Checks still run only from a clone of that repository checked out at the PR head; otherwise every Evidence row is `NOT_RUN`.

## What it does

1. Fetches the PR diff, description, and existing review threads
2. Runs `pr-analyst`, which gathers context (conventions, ADRs, git history, callers of changed symbols), runs the repo's own checks (tests, lint, type-check, declared scans), and produces a structured report — see [ADR-009](../adr/ADR-009-tool-grounded-review.md)
3. Writes the report to `~/dev/pr-reviews/<pr-number>-<slug>.md`
4. Surfaces blocking issues immediately if any are found

## Output format

```
~/dev/pr-reviews/42-rate-limiting.md
```

Report sections:
- Summary of changes
- Evidence — each check with command, source, and `PASS` / `FAIL` / `N/A` / `NOT_RUN` / `PRE_EXISTING` (fails on the base branch too, per the CI results of the merge-base fetched by `scripts/gh-get-check-runs.mjs`)
- Risk assessment (Low / Medium / High)
- Blocking issues (must fix before merge)
- Non-blocking suggestions
- Test coverage gaps
- AC coverage checklist (if linked issue found)

Each finding is tagged `[severity · origin]`: severity `High` / `Medium` / `Low`, origin `introduced` / `amplified` / `pre-existing`. Blocking: `introduced` findings of severity `High` or `Medium`, and `amplified` findings of severity `High`. Coverage gates declared in CI for a touched module are run and reported as an Evidence row.

Checks only run when the working tree is exactly the PR head (HEAD = PR head SHA, clean `git status`). Run `gh pr checkout 42` on a clean tree first; otherwise the Evidence rows are `NOT_RUN` and the status is `NEEDS_REVIEW`. A check that fails identically on the base branch's CI is reported as `PRE_EXISTING` and does not block.

## Without an authenticated `gh`

If `gh auth status` fails (e.g. a Claude Code cloud session), the command fetches the PR through the GitHub MCP server and normalizes it with `scripts/normalize-pr.mjs`, so pr-analyst receives the same fields ([ADR-010](../adr/ADR-010-github-mcp-fallback-transport.md)). Base CI results are not available in that mode: a check that fails is reported `FAIL`, never `PRE_EXISTING`.

## Human gates

1. **Invocation** — you decide when to run it
2. **Fork execution** — for a PR from a fork that is checked out, the command asks before pr-analyst executes anything from the branch (not asked when the PR is not checked out: nothing would run); declining yields `NOT_RUN` rows
3. **NEEDS_REVIEW** — blocking issues and `FAIL` / `NOT_RUN` evidence are surfaced; no auto-comment posted
4. **Comment posting** — you are asked for confirmation before any GitHub comment is posted

## See also

- [`agents/pr-analyst.md`](../../agents/pr-analyst.md)
- [`/pr-fixer`](pr-fixer.md) — apply the blocking fixes from the report
- [`scripts/gh-get-pr.mjs`](../../scripts/gh-get-pr.mjs)
- [`scripts/gh-get-pr-threads.mjs`](../../scripts/gh-get-pr-threads.mjs)
