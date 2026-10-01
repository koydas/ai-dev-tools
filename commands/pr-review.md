# /pr-review

Fetch the current PR, run a structured review, and write the report to `~/dev/pr-reviews/`.

## Steps

1. Determine the PR to review:
   - If an argument is provided (`$ARGUMENTS`), use it as the PR number
   - Otherwise, use the current branch: `node scripts/gh-get-pr.mjs` (auto-detects head branch)
2. Fetch PR metadata (title, description, author, labels): `node scripts/gh-get-pr.mjs $ARGUMENTS`
3. Fetch the PR diff (changed hunks): `node scripts/gh-get-pr.mjs` exports `getPrDiff(<pr-number>)`, or run `gh pr diff <pr-number>` directly — pass the full patch to pr-analyst
4. Fetch reviewer comment threads: `node scripts/gh-get-pr-threads.mjs <pr-number>`
5. **Fork gate** — if `isCrossRepository` is true, ask the user whether pr-analyst may execute the repository's checks on code from the fork. Record the answer as the fork execution approval (yes / no)
6. Pass PR diff, description, threads, the metadata from step 2 (including `headRefOid` and `isCrossRepository`), and the fork execution approval to the `pr-analyst` agent
   - pr-analyst runs the repo's checks only if the working tree is exactly the PR head (HEAD = `headRefOid`, clean `git status`); otherwise its Evidence rows are `NOT_RUN` and the status is `NEEDS_REVIEW`. Check out the PR (`gh pr checkout <pr-number>`) on a clean tree before invoking for a fully grounded review
7. Write the `### Review` block to `~/dev/pr-reviews/<pr-number>-<slug>.md`
8. If status is `NEEDS_REVIEW`, surface the blocking issues and every Evidence row that is `FAIL` or `NOT_RUN` (with its reason) immediately
9. If status is `DONE`, confirm the report path and offer to post a summary comment via `node scripts/gh-post-comment.mjs`
