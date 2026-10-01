# /ac-check

Validate the current branch diff against a GitHub issue's acceptance criteria.

## Steps

1. Fetch the issue: `node scripts/gh-get-issue.mjs $ARGUMENTS`
2. Extract acceptance criteria from the issue body
3. Get the current branch diff, committed and uncommitted: `git diff $(git merge-base main HEAD)`, plus untracked files from `git status --porcelain`
4. Fetch the base branch's CI results: `node scripts/gh-get-check-runs.mjs --merge-base main`. If the script fails, pass no base CI input
5. Pass the diff, acceptance criteria and base CI results to the `code-reviewer` agent — it runs the repo's checks against the working tree
6. Present the `### Review` → `**AC coverage**` checklist and `**Evidence**` table to the user
7. If `NEEDS_REVIEW`, surface blocking issues and every Evidence row that is `FAIL` or `NOT_RUN` (with its reason)
8. If `DONE`, confirm all criteria are met and the repo's checks pass
