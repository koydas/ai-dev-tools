# /pr-fixer

Apply blocking fixes from an existing review file to the current branch.

## Steps

1. Locate the review file:
   - If an argument is provided (`$ARGUMENTS`), use it as the path, or as the PR number to find the file in the reports directory (`node scripts/report-path.mjs --dir`)
   - Otherwise, look for the most recent file in the reports directory matching the current branch's PR number
2. Read the blocking issues from the `### Review` → `**Blocking issues**` section
3. Pass the blocking issues list and the current diff to the `code-builder` agent
4. code-builder addresses each blocking issue in turn
5. Fetch the base branch's CI results: `node scripts/gh-get-check-runs.mjs --merge-base` (if the script fails, pass none), then pass the updated diff back to the `code-reviewer` agent with the original acceptance criteria and the base CI results — it re-runs the repo's checks against the fixed working tree
6. If `NEEDS_REVIEW` again, surface remaining blockers and every Evidence row that is `FAIL` or `NOT_RUN` — do not loop automatically
7. If `DONE`, present the patch and confirm the fixes are ready for re-review
