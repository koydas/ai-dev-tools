# /pr-fixer

Apply the fixes from the `/pr-review` report and from human PR comments to the current branch: blocking issues first, then the non-blocking findings and human requests whose fix is in the PR's scope.

## Purpose

Closes the loop between `/pr-review` and a clean, mergeable branch. Takes the findings identified by `pr-analyst` or `code-reviewer` and hands them to `code-builder` to resolve. Non-blocking suggestions are applied too, so they do not pile up as follow-up issues nobody files ([ADR-014](../adr/ADR-014-pr-fixer-applies-non-blocking.md)).

## Invocation

```
/pr-fixer                  # uses the review file matching the current branch's PR
/pr-fixer 42               # uses the review file for PR #42
/pr-fixer ~/dev/pr-reviews/42-rate-limiting.md   # explicit file path
/pr-fixer 42 --blocking-only                    # blocking issues only (previous behavior)
```

## What it does

0. Stops with `NEEDS_REVIEW` when the PR conflicts with its base (`mergeable: CONFLICTING`): resolve the conflict first (autonomous-dev-loop **Conflicts Fix** workflow, or merge the base by hand), then re-run
1. Reads the blocking issues and the non-blocking suggestions (`**Non-blocking suggestions**` / `**Non-blocking notes**`) from the review file — or from the latest `/pr-review` report posted on the PR when there is no local file
2. Reads the human feedback with `scripts/gh-get-pr-feedback.mjs`: comments, review bodies and unresolved threads written by humans with a role on the repository (`OWNER` / `MEMBER` / `COLLABORATOR`). **Only two sources are applied — the `/pr-review` report and those humans.** Left out: bots (`type: Bot`, `[bot]` logins — Codex, Claude Code Review, CI), resolved threads, and — listed for you, never applied — generated comments on a human account (Claude Code footer, machine markers such as `<!-- adl-review … -->`), outsiders (anyone can comment on a public PR, report-shaped text included) and authors whose type cannot be determined
3. Runs `code-builder` with the report's lists, the human feedback and the current diff — blocking first. A human comment that asks for no change (question, approval) or needs a design decision is skipped with the reason
   - **Class sweep**: for each applied finding it names the defect class, searches the touched function, its file and its siblings (callers, mirrored branches, docs and tests that state the behavior) for the same class and fixes every occurrence in the same patch, each with a regression test. The report lists, per finding, what was searched, fixed and left out of the perimeter. Why: on 250 PRs of autonomous-dev-loop, 19 held 57 % of the external-review threads, 70 % on a single file, each round finding a neighbour of the previous fix
4. Applies every non-blocking finding whose fix stays in the PR's scope — **nits** (naming, typos, style, stale comments) and findings marked optional included: being minor is never a reason to skip. Otherwise skips it with the reason:
   - `pre-existing` finding in a file the PR does not touch
   - the fix needs a new dependency, or changes a public API / schema the PR does not already change
   - not a code change (label, issue, process action) — reported for the human
5. Fetches the base branch's CI results (`scripts/gh-get-check-runs.mjs`) and re-runs `code-reviewer` on the updated diff — including the repo's checks against the fixed working tree ([ADR-009](../adr/ADR-009-tool-grounded-review.md))
6. If issues remain, surfaces them — does not loop automatically
7. If clean, presents the updated patch for human review, with each finding and human comment marked applied or skipped, and a draft reply per human thread (nothing is posted)

## Output

An updated diff addressing the blocking issues and the in-scope non-blocking suggestions, a list of every finding as applied / skipped (with reason), and a re-review confirming resolution with a fresh Evidence table. A skipped non-blocking finding never changes the status.

## Human gates

1. **Invocation** — you decide when to apply fixes, and whether to pass `--blocking-only`
2. **Re-review result** — any remaining `NEEDS_REVIEW` is surfaced, never silently retried
3. **Merge** — nothing is committed automatically

## See also

- [`/pr-review`](pr-review.md) — generate the review report this command reads
- [`agents/code-builder.md`](../../agents/code-builder.md)
- [`agents/code-reviewer.md`](../../agents/code-reviewer.md)
