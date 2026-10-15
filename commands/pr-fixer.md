---
description: "Apply the fixes of an existing /pr-review report — blocking issues, then in-scope non-blocking suggestions — to the current branch"
argument-hint: "[review-file | pr-number] [--blocking-only]"
---

# /pr-fixer

Apply the findings of an existing review file to the current branch: every blocking issue, then every non-blocking suggestion whose fix is in the PR's scope ([ADR-014](../docs/adr/ADR-014-pr-fixer-applies-non-blocking.md)). With `--blocking-only`, only the blocking issues.

## Steps

1. Locate the review file:
   - If an argument other than `--blocking-only` is provided, use it as the path, or as the PR number to find the file in the reports directory (`node "${CLAUDE_PLUGIN_ROOT}/scripts/report-path.mjs" --dir`)
   - Otherwise, look for the most recent file in the reports directory matching the current branch's PR number
2. Read the findings from the `### Review` block:
   - **Blocking**: the `**Blocking issues**` section
   - **Non-blocking** (skipped with `--blocking-only`): the `**Non-blocking suggestions**` section (pr-analyst report) or `**Non-blocking notes**` (code-reviewer report)
3. Pass both lists, labelled blocking / non-blocking, and the current diff to the `code-builder` agent
4. code-builder addresses each blocking issue in turn, then each non-blocking finding in the PR's scope; it skips the others with their reason (ADR-014 scope rule)
5. Fetch the base branch's CI results: `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh-get-check-runs.mjs" --merge-base` (if the script fails, pass none), then pass the updated diff back to the `code-reviewer` agent with the original acceptance criteria and the base CI results — it re-runs the repo's checks against the fixed working tree
6. If `NEEDS_REVIEW` again, surface remaining blockers and every Evidence row that is `FAIL` or `NOT_RUN` — do not loop automatically
7. If `DONE`, present the patch, list every finding as applied or skipped (with its reason), and confirm the fixes are ready for re-review
