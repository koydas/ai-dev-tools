# /pr-fixer

Apply blocking fixes from an existing review file to the current branch.

## Steps

1. Locate the review file:
   - If an argument is provided (`$ARGUMENTS`), use it as the path or PR number to find the file in `~/dev/pr-reviews/`
   - Otherwise, look for the most recent file in `~/dev/pr-reviews/` matching the current branch's PR number
2. Read the blocking issues from the `### Review` → `**Blocking issues**` section
3. Pass the blocking issues list and the current diff to the `code-builder` agent
4. code-builder addresses each blocking issue in turn
5. Pass the updated diff back to the `code-reviewer` agent with the original acceptance criteria
6. If `NEEDS_REVIEW` again, surface remaining blockers — do not loop automatically
7. If `DONE`, present the patch and confirm the fixes are ready for re-review
