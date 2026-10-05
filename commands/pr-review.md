# /pr-review

Fetch the current PR, run a structured review, and write the report to `~/dev/pr-reviews/`.

## Steps

0. **Transport preflight** — run `gh auth status`. If it fails, tell the user once that GitHub is reached through the GitHub MCP server for this run, then replace the `gh` scripts below as follows ([ADR-010](../docs/adr/ADR-010-github-mcp-fallback-transport.md)):
   - Step 2: fetch the PR with the MCP `pull_request_read` tool (method `get`), write the response with the file-writing tool (not a shell heredoc: the body is author-controlled) to a file **outside the working tree** (the OS temp directory or the session scratchpad — a file in the clone makes `git status` dirty and pr-analyst then reports every check `NOT_RUN`), and run `node scripts/normalize-pr.mjs <file>` — its output replaces `gh-get-pr.mjs`
   - Step 3: MCP `pull_request_read` method `get_diff`
   - Step 4: MCP `pull_request_read` methods `get_review_comments` and `get_comments`, passed to pr-analyst as returned and labelled as raw MCP output (the one documented exception to normalization in ADR-010)
   - Step 6: skipped — the MCP server exposes no check runs for an arbitrary commit, so no base CI input is passed
   - Step 11: post the comment with the MCP `add_issue_comment` tool (the PR number as `issue_number`), after the same confirmation
1. Determine the PR to review:
   - If an argument is provided (`$ARGUMENTS`), use it as the PR number
   - Otherwise, use the current branch: `node scripts/gh-get-pr.mjs` (auto-detects head branch)
2. Fetch PR metadata (title, description, author, labels): `node scripts/gh-get-pr.mjs $ARGUMENTS`
3. Fetch the PR diff (changed hunks): `node scripts/gh-get-pr.mjs` exports `getPrDiff(<pr-number>)`, or run `gh pr diff <pr-number>` directly — pass the full patch to pr-analyst
4. Fetch reviewer comment threads: `node scripts/gh-get-pr-threads.mjs <pr-number>`
5. Check whether the PR is checked out: `git rev-parse HEAD` equals `headRefOid`. If not, skip steps 6 and 7 — pr-analyst will report every check `NOT_RUN`, so there is nothing to approve or compare
6. Fetch the base branch's CI results: `node scripts/gh-get-check-runs.mjs --merge-base origin/<baseRefName>` (check runs of the merge-base commit). If the script fails, pass no base CI input — pr-analyst then reports failures as `FAIL`, never `PRE_EXISTING`
7. **Fork gate** — if `isCrossRepository` is true, ask the user whether pr-analyst may execute the repository's checks on code from the fork. Record the answer as the fork execution approval (yes / no)
8. Pass PR diff, description, threads, the metadata from step 2 (including `headRefOid` and `isCrossRepository`), the base CI results from step 6, and the fork execution approval to the `pr-analyst` agent
   - pr-analyst runs the repo's checks only if the working tree is exactly the PR head (HEAD = `headRefOid`, clean `git status`); otherwise its Evidence rows are `NOT_RUN` and the status is `NEEDS_REVIEW`. Check out the PR (`gh pr checkout <pr-number>`) on a clean tree before invoking for a fully grounded review
9. Write the `### Review` block to `~/dev/pr-reviews/<pr-number>-<slug>.md`
10. If status is `NEEDS_REVIEW`, surface the blocking issues and every Evidence row that is `FAIL` or `NOT_RUN` (with its reason) immediately
11. If status is `DONE`, confirm the report path and offer to post a summary comment via `node scripts/gh-post-comment.mjs`
