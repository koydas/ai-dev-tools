# /pr-review

Fetch the current PR, run a structured review, and write the report to `~/dev/pr-reviews/`.

## Steps

1. Determine the PR to review:
   - If an argument is provided (`$ARGUMENTS`), use it as the PR number
   - Otherwise, use the current branch: `node scripts/gh-get-pr.mjs` (auto-detects head branch)
2. Fetch PR metadata (title, description, author, labels): `node scripts/gh-get-pr.mjs $ARGUMENTS`
3. Fetch the PR diff (changed hunks): `node scripts/gh-get-pr.mjs` exports `getPrDiff(<pr-number>)`, or run `gh pr diff <pr-number>` directly — pass the full patch to pr-analyst
4. Fetch reviewer comment threads: `node scripts/gh-get-pr-threads.mjs <pr-number>`
5. Pass PR diff, description, and threads to the `pr-analyst` agent
6. Write the `### Review` block to `~/dev/pr-reviews/<pr-number>-<slug>.md`
7. If status is `NEEDS_REVIEW`, surface the blocking issues immediately
8. If status is `DONE`, confirm the report path and offer to post a summary comment via `node scripts/gh-post-comment.mjs`
