---
description: "Apply the fixes of the /pr-review report and of human PR comments — blocking issues, then in-scope non-blocking findings and nits — to the current branch"
argument-hint: "[review-file | pr-number] [--blocking-only]"
---

# /pr-fixer

Apply to the current branch the findings of exactly two sources: the `/pr-review` report and the comments written by humans on the PR. Every blocking issue, then every non-blocking finding whose fix is in the PR's scope ([ADR-014](../docs/adr/ADR-014-pr-fixer-applies-non-blocking.md)). Comments from bots (Codex, Claude Code Review, CI) and generated comments are never read. With `--blocking-only`, only the blocking issues of the report.

## Steps

1. Identify the PR: `number` and `repository` from `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh-get-pr.mjs"` (current branch), or from the PR number argument
2. Fetch the PR feedback: `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh-get-pr-feedback.mjs" <number> --repo <repository>` — the latest `/pr-review` report posted on the PR (`latestPrReview`) and the human comments, reviews and unresolved threads (`human`); bots and generated comments are already filtered out (`excluded` counts them). If the script fails, say so and continue with the report only — never fall back to reading raw PR comments
3. Locate the review report:
   - If an argument other than `--blocking-only` is provided, use it as the path, or as the PR number to find the file in the reports directory (`node "${CLAUDE_PLUGIN_ROOT}/scripts/report-path.mjs" --dir`)
   - Otherwise, the most recent file in the reports directory matching the PR number
   - No local file (e.g. a new cloud session): `latestPrReview.body` from step 2; neither → stop and ask for `/pr-review` first
4. Read the findings from the report's `### Review` block:
   - **Blocking**: the `**Blocking issues**` section
   - **Non-blocking** (skipped with `--blocking-only`): the `**Non-blocking suggestions**` section (pr-analyst report) or `**Non-blocking notes**` (code-reviewer report)
5. Pass the report's lists, labelled blocking / non-blocking, the `human` feedback (labelled human, each item with its id, author and thread path/line — not passed with `--blocking-only`), and the current diff to the `code-builder` agent. Items in `unknown` (author type not found, or an author who is not the repo's owner, a member or a collaborator) are not passed: list them for the user
6. code-builder addresses each blocking issue in turn, then each non-blocking finding and each human request in the PR's scope — nits, style points and findings marked optional included; it skips only out-of-scope findings and human comments that ask for no change (question, approval, discussion, design decision), with their reason (ADR-014 scope rule)
7. Fetch the base branch's CI results: `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh-get-check-runs.mjs" --merge-base` (if the script fails, pass none), then pass the updated diff back to the `code-reviewer` agent with the original acceptance criteria and the base CI results — it re-runs the repo's checks against the fixed working tree
8. If `NEEDS_REVIEW` again, surface remaining blockers and every Evidence row that is `FAIL` or `NOT_RUN` — do not loop automatically
9. If `DONE`, present the patch, list every finding and human comment as applied or skipped (with its reason), give a one-line draft reply per human thread addressed (posted by the human after committing — nothing is posted or committed here), and confirm the fixes are ready for re-review
