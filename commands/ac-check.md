# /ac-check

Validate the current branch diff against a GitHub issue's acceptance criteria.

## Steps

1. Fetch the issue: `node scripts/gh-get-issue.mjs $ARGUMENTS`
2. Extract acceptance criteria from the issue body
3. Get the current branch diff, committed and uncommitted: `git diff $(git merge-base main HEAD)`, plus untracked files from `git status --porcelain`
4. Pass the diff and acceptance criteria to the `code-reviewer` agent — it runs the repo's checks against the working tree
5. Present the `### Review` → `**AC coverage**` checklist and `**Evidence**` table to the user
6. If `NEEDS_REVIEW`, surface blocking issues and every Evidence row that is `FAIL` or `NOT_RUN` (with its reason)
7. If `DONE`, confirm all criteria are met and the repo's checks pass
