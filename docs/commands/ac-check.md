# /ac-check

Validate the current branch diff against a GitHub issue's acceptance criteria.

## Purpose

A lightweight spot-check: run just the review step (no ticket parsing, no code generation) against a specific issue's AC. Useful when you've built something manually and want to verify coverage before opening a PR.

## Invocation

```
/ac-check 42
```

Where `42` is the GitHub issue number whose AC you want to check against.

## What it does

1. Fetches the issue and extracts acceptance criteria
2. Diffs the current branch against `main` — committed, uncommitted, and untracked changes
3. Runs `code-reviewer`, which maps the diff to the AC items and runs the repo's own checks (tests, lint, type-check) against the working tree — see [ADR-009](../adr/ADR-009-tool-grounded-review.md)
4. Presents an AC coverage checklist and the Evidence table

## Output

```markdown
**AC coverage**
- [x] Rate limit applied per client key — covered in middleware/rateLimiter.ts:34
- [ ] Returns 429 with Retry-After header — **MISSING**
- [x] Limit configurable per environment — covered in config/defaults.ts:12
```

```markdown
**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `npm test` | `package.json` | PASS — 64/64 |
| Lint | `npm run lint` | `ci.yml` | FAIL — 1 error |
```

If all items are covered and every Evidence row is `PASS`, `N/A` or `PRE_EXISTING`: `DONE — all AC satisfied`
If any item is missing, or any row is `FAIL` / `NOT_RUN`: `NEEDS_REVIEW` with the uncovered items and failing rows

## See also

- [`agents/code-reviewer.md`](../../agents/code-reviewer.md)
- [`/issue-code-generation`](issue-code-generation.md) — full pipeline including AC check
- [`/pr-fixer`](pr-fixer.md) — address gaps found by ac-check
