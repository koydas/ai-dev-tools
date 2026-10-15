# /pr-fixer

Apply the fixes from an existing review report to the current branch: blocking issues first, then the non-blocking suggestions whose fix is in the PR's scope.

## Purpose

Closes the loop between `/pr-review` and a clean, mergeable branch. Takes the findings identified by `pr-analyst` or `code-reviewer` and hands them to `code-builder` to resolve. Non-blocking suggestions are applied too, so they do not pile up as follow-up issues nobody files ([ADR-014](../adr/ADR-014-pr-fixer-applies-non-blocking.md)).

## Invocation

```
/pr-fixer                  # uses the review file matching the current branch's PR
/pr-fixer 42               # uses the review file for PR #42
/pr-fixer ~/dev/pr-reviews/42-rate-limiting.md   # explicit file path
/pr-fixer 42 --blocking-only                    # blocking issues only (previous behavior)
```

## What it does

1. Reads the blocking issues and the non-blocking suggestions (`**Non-blocking suggestions**` / `**Non-blocking notes**`) from the review file
2. Runs `code-builder` with both lists and the current diff — blocking first
3. Applies every non-blocking finding whose fix stays in the PR's scope — **nits** (naming, typos, style, stale comments) and findings marked optional included: being minor is never a reason to skip. Otherwise skips it with the reason:
   - `pre-existing` finding in a file the PR does not touch
   - the fix needs a new dependency, or changes a public API / schema the PR does not already change
   - not a code change (label, issue, process action) — reported for the human
4. Fetches the base branch's CI results (`scripts/gh-get-check-runs.mjs`) and re-runs `code-reviewer` on the updated diff — including the repo's checks against the fixed working tree ([ADR-009](../adr/ADR-009-tool-grounded-review.md))
5. If issues remain, surfaces them — does not loop automatically
6. If clean, presents the updated patch for human review, with each finding marked applied or skipped

## Output

An updated diff addressing the blocking issues and the in-scope non-blocking suggestions, a list of every finding as applied / skipped (with reason), and a re-review confirming resolution with a fresh Evidence table. A skipped non-blocking finding never changes the status.

## Human gates

1. **Invocation** — you decide when to apply fixes, and whether to pass `--blocking-only`
2. **Re-review result** — any remaining `NEEDS_REVIEW` is surfaced, never silently retried
3. **Merge** — nothing is committed automatically

## See also

- [`/pr-review`](pr-review.md) — generate the review report this command reads
- [`agents/code-builder.md`](../../agents/code-builder.md)
- [`agents/code-reviewer.md`](../../agents/code-reviewer.md)
