# /pr-review

Fetch the current PR, run a structured review, and write the report to the reports directory (`node scripts/report-path.mjs --dir`, default `~/dev/pr-reviews/`).

## Steps

0. **Transport preflight** — run `gh auth status`. If it fails, tell the user once that GitHub is reached through the GitHub MCP server for this run, then replace the `gh` scripts below as follows ([ADR-010](../docs/adr/ADR-010-github-mcp-fallback-transport.md)):
   - Step 1: the GitHub reference comes from `$ARGUMENTS` parsed by `parsePrRef` of `scripts/gh-get-pr.mjs`, passed quoted: `node --input-type=module -e 'import { parsePrRef } from "./scripts/gh-get-pr.mjs"; console.log(JSON.stringify(parsePrRef(process.argv[1])))' "$ARGUMENTS"`. Without a `repo` in the result, `repository` is the `origin` remote of the working directory. Without an argument, find the PR of the current branch with the MCP `list_pull_requests` tool (`head: <owner>:<branch>`)
   - Step 2: fetch the PR with the MCP `pull_request_read` tool (method `get`), write the response with the file-writing tool (not a shell heredoc: the body is author-controlled) to a file **outside the working tree** (the OS temp directory or the session scratchpad — a file in the clone makes `git status` dirty and pr-analyst then reports every check `NOT_RUN`), and run `node scripts/normalize-pr.mjs <file>` — its output replaces `gh-get-pr.mjs`
   - Step 3: MCP `pull_request_read` method `get_diff`
   - Step 4: MCP `pull_request_read` methods `get_review_comments` and `get_comments`, passed to pr-analyst as returned and labelled as raw MCP output (the one documented exception to normalization in ADR-010)
   - Step 5: compare `repository` with the `origin` remote URL (`git remote get-url origin`) instead of `gh repo view`, which needs an authenticated `gh`
   - Step 6: skipped — the MCP server exposes no check runs for an arbitrary commit, so no base CI input is passed
   - Step 10: post the report with the MCP `add_issue_comment` tool (the PR number as `issue_number`), on every run like the script path ([ADR-011](../docs/adr/ADR-011-pr-review-posts-report.md))
1. Determine the PR to review — `$ARGUMENTS` accepts `42`, `#42`, `owner/repo#42` or a PR URL (`https://github.com/owner/repo/pull/42`):
   - If an argument is provided, pass it quoted, as a single argument: `node scripts/gh-get-pr.mjs "$ARGUMENTS"` — unquoted, the shell reads `#42` as a comment and `&` in a URL as a control operator
   - Otherwise, run `node scripts/gh-get-pr.mjs` with no argument — the script uses the current branch (auto-detects head branch)
2. Fetch PR metadata (title, description, author, labels) with the command from step 1. Its output carries `number` and `repository` (`owner/repo`); every later step uses them, passing `--repo <repository>`
3. Fetch the PR diff (changed hunks): `node scripts/gh-get-pr.mjs` exports `getPrDiff(<number>, <repository>)`, or run `gh pr diff <number> --repo <repository>` directly — pass the full patch to pr-analyst
4. Fetch reviewer comment threads: `node scripts/gh-get-pr-threads.mjs <number> --repo <repository>`
5. Check whether the PR is checked out: `gh repo view --json nameWithOwner -q .nameWithOwner` equals `<repository>` (case-insensitive) and `git rev-parse HEAD` equals `headRefOid`. If not, skip steps 6 and 7 — pr-analyst will report every check `NOT_RUN`, so there is nothing to approve or compare
6. Fetch the base branch's CI results: `node scripts/gh-get-check-runs.mjs --merge-base origin/<baseRefName> --repo <repository>` (check runs of the merge-base commit). If the script fails, pass no base CI input — pr-analyst then reports failures as `FAIL`, never `PRE_EXISTING`
7. **Fork gate** — if `isCrossRepository` is true, ask the user whether pr-analyst may execute the repository's checks on code from the fork. Record the answer as the fork execution approval (yes / no)
8. Pass PR diff, description, threads, the metadata from step 2 (including `headRefOid` and `isCrossRepository`), the base CI results from step 6, and the fork execution approval to the `pr-analyst` agent
   - pr-analyst runs the repo's checks only if the working tree is exactly the PR head (HEAD = `headRefOid`, clean `git status`); otherwise its Evidence rows are `NOT_RUN` and the status is `NEEDS_REVIEW`. Check out the PR (`gh pr checkout <number> --repo <repository>`, from a clone of `<repository>`) on a clean tree before invoking for a fully grounded review
9. Write the `### Review` block to the path printed by `node scripts/gh-get-pr.mjs <number> --repo <repository> | node scripts/report-path.mjs --from-pr` — never put the PR title on a command line: it is author-controlled text
10. **Post the report on the PR — always, whatever the status** ([ADR-011](../docs/adr/ADR-011-pr-review-posts-report.md)): `node scripts/gh-post-comment.mjs <number> --repo <repository> < <report path>` — the body is read from the report file via stdin, never put on the command line. Print the comment URL it returns. If posting fails, say so with the error and keep the local report
11. If status is `NEEDS_REVIEW`, surface the blocking issues and every Evidence row that is `FAIL` or `NOT_RUN` (with its reason) immediately
12. If status is `DONE`, confirm the report path and the comment URL
