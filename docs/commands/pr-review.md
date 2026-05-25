# /pr-review

Structured PR review with a written report, using the `pr-analyst` agent.

## Purpose

Produces a consistent, structured review for any PR — covering correctness, risks, test coverage, and AC coverage — and saves it to a file for reference or sharing.

## Invocation

```
/pr-review          # reviews the PR for the current branch
/pr-review 42       # reviews PR #42 by number
```

## What it does

1. Fetches the PR diff, description, and existing review threads
2. Runs `pr-analyst` to produce a structured report
3. Writes the report to `~/dev/pr-reviews/<pr-number>-<slug>.md`
4. Surfaces blocking issues immediately if any are found

## Output format

```
~/dev/pr-reviews/42-rate-limiting.md
```

Report sections:
- Summary of changes
- Risk assessment (Low / Medium / High)
- Blocking issues (must fix before merge)
- Non-blocking suggestions
- Test coverage gaps
- AC coverage checklist (if linked issue found)

## Human gates

1. **Invocation** — you decide when to run it
2. **NEEDS_REVIEW** — blocking issues are surfaced; no auto-comment posted
3. **Comment posting** — you are asked for confirmation before any GitHub comment is posted

## See also

- [`agents/pr-analyst.md`](../../agents/pr-analyst.md)
- [`/pr-fixer`](pr-fixer.md) — apply the blocking fixes from the report
- [`scripts/gh-get-pr.mjs`](../../scripts/gh-get-pr.mjs)
- [`scripts/gh-get-pr-threads.mjs`](../../scripts/gh-get-pr-threads.mjs)
