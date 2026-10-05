# /pr-review

Fetch the current PR, run a structured review, and write the report to the reports directory (`node scripts/report-path.mjs --dir`, default `~/dev/pr-reviews/`).

## Steps

1. Determine the PR to review — `$ARGUMENTS` accepts `42`, `#42`, `owner/repo#42` or a PR URL (`https://github.com/owner/repo/pull/42`):
   - If an argument is provided, pass it quoted, as a single argument: `node scripts/gh-get-pr.mjs "$ARGUMENTS"` — unquoted, the shell reads `#42` as a comment and `&` in a URL as a control operator
   - Otherwise, run `node scripts/gh-get-pr.mjs` with no argument — the script uses the current branch (auto-detects head branch)
2. Fetch PR metadata (title, description, author, labels) with the command from step 1. Its output carries `number` and `repository` (`owner/repo`); every later step uses them, passing `--repo <repository>`
3. Fetch the PR diff (changed hunks): `node scripts/gh-get-pr.mjs` exports `getPrDiff(<number>, <repository>)`, or run `gh pr diff <number> --repo <repository>` directly — pass the full patch to pr-analyst
4. Fetch reviewer comment threads: `node scripts/gh-get-pr-threads.mjs <number> --repo <repository>`
5. Check whether the PR is checked out: `gh api 'repos/{owner}/{repo}' --jq .full_name` equals `<repository>` (case-insensitive) and `git rev-parse HEAD` equals `headRefOid`. If not, skip steps 6 and 7 — pr-analyst will report every check `NOT_RUN`, so there is nothing to approve or compare
6. Fetch the base branch's CI results: `node scripts/gh-get-check-runs.mjs --merge-base origin/<baseRefName> --repo <repository>` (check runs of the merge-base commit). If the script fails, pass no base CI input — pr-analyst then reports failures as `FAIL`, never `PRE_EXISTING`
7. **Fork gate** — if `isCrossRepository` is true, ask the user whether pr-analyst may execute the repository's checks on code from the fork. Record the answer as the fork execution approval (yes / no)
8. Pass PR diff, description, threads, the metadata from step 2 (including `headRefOid` and `isCrossRepository`), the base CI results from step 6, and the fork execution approval to the `pr-analyst` agent
   - pr-analyst runs the repo's checks only if the working tree is exactly the PR head (HEAD = `headRefOid`, clean `git status`); otherwise its Evidence rows are `NOT_RUN` and the status is `NEEDS_REVIEW`. Check out the PR (`git fetch origin pull/<number>/head && git checkout --detach FETCH_HEAD`, from a clone of `<repository>` — `gh pr checkout` needs GraphQL) on a clean tree before invoking for a fully grounded review
9. Write the `### Review` block to the path printed by `node scripts/gh-get-pr.mjs <number> --repo <repository> | node scripts/report-path.mjs --from-pr` — never put the PR title on a command line: it is author-controlled text
10. If status is `NEEDS_REVIEW`, surface the blocking issues and every Evidence row that is `FAIL` or `NOT_RUN` (with its reason) immediately
11. If status is `DONE`, confirm the report path and offer to post a summary comment via `node scripts/gh-post-comment.mjs <number> --repo <repository>`
