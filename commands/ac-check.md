# /ac-check

Validate the current branch diff against a GitHub issue's acceptance criteria.

## Steps

1. Fetch the issue: `node scripts/gh-get-issue.mjs $ARGUMENTS`
2. Extract acceptance criteria from the issue body
3. Get the current branch diff: `git diff main...HEAD`
4. Pass the diff and acceptance criteria to the `code-reviewer` agent
5. Present the `### Review` → `**AC coverage**` checklist to the user
6. If `NEEDS_REVIEW`, surface blocking issues
7. If `DONE`, confirm all criteria are met
