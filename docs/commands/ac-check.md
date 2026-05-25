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
2. Diffs the current branch against `main`
3. Runs `code-reviewer` to map the diff to the AC items
4. Presents an AC coverage checklist

## Output

```markdown
**AC coverage**
- [x] Rate limit applied per client key — covered in middleware/rateLimiter.ts:34
- [ ] Returns 429 with Retry-After header — **MISSING**
- [x] Limit configurable per environment — covered in config/defaults.ts:12
```

If all items are covered: `DONE — all AC satisfied`
If any are missing: `NEEDS_REVIEW — <n> items uncovered`

## See also

- [`agents/code-reviewer.md`](../../agents/code-reviewer.md)
- [`/issue-code-generation`](issue-code-generation.md) — full pipeline including AC check
- [`/pr-fixer`](pr-fixer.md) — address gaps found by ac-check
