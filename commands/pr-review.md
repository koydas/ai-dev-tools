# /pr-review

Fetch the current PR, run a structured review, and write the report to `~/dev/pr-reviews/`.

## Steps

1. Determine the PR to review:
   - If an argument is provided (`$ARGUMENTS`), use it as the PR number
   - Otherwise, use the current branch: `node scripts/gh-get-pr.mjs` (auto-detects head branch)
2. Fetch PR diff and metadata: `node scripts/gh-get-pr.mjs $ARGUMENTS`
3. Fetch reviewer comment threads: `node scripts/gh-get-pr-threads.mjs <pr-number>`
4. Pass PR diff, description, and threads to the `pr-analyst` agent
5. Write the `### Review` block to `~/dev/pr-reviews/<pr-number>-<slug>.md`
6. If status is `NEEDS_REVIEW`, surface the blocking issues immediately
7. If status is `DONE`, confirm the report path and offer to post a summary comment via `node scripts/gh-post-comment.mjs`
