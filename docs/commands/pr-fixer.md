# /pr-fixer

Apply the blocking fixes from an existing review report to the current branch.

## Purpose

Closes the loop between `/pr-review` and a clean, mergeable branch. Takes the blocking issues identified by `pr-analyst` or `code-reviewer` and hands them to `code-builder` to resolve.

## Invocation

```
/pr-fixer           # uses the review file matching the current branch's PR
/pr-fixer 42        # uses the review file for PR #42
/pr-fixer ~/dev/pr-reviews/42-rate-limiting.md   # explicit file path
```

## What it does

1. Reads the blocking issues from the review file
2. Runs `code-builder` with the blocking issues list and the current diff
3. Re-runs `code-reviewer` on the updated diff
4. If issues remain, surfaces them — does not loop automatically
5. If clean, presents the updated patch for human review

## Output

An updated diff addressing the listed blocking issues, with a re-review confirming resolution.

## Human gates

1. **Invocation** — you decide when to apply fixes
2. **Re-review result** — any remaining `NEEDS_REVIEW` is surfaced, never silently retried
3. **Merge** — nothing is committed automatically

## See also

- [`/pr-review`](pr-review.md) — generate the review report this command reads
- [`agents/code-builder.md`](../../agents/code-builder.md)
- [`agents/code-reviewer.md`](../../agents/code-reviewer.md)
