# /resume

Resume an interrupted `/issue-code-generation` pipeline from the first missing checkpoint.

## Invocation

```
/resume <issueId> --repo <owner/repo> [--strict]
```

`--repo` is required and must match the repository used in the original `/issue-code-generation` run — checkpoints are namespaced by repo so runs against different repositories with the same issue number do not collide.

Pass `--strict` if the original run used `--strict`. This flag is **required** to ensure `code-challenger` is not skipped when resuming a strict run interrupted before `04-challenges` was written.

## Steps

1. Run `node scripts/checkpoint.mjs list --repo <owner/repo> <issueId>` to get the list of already-completed steps
2. Display the completed steps to the user so they can confirm the resume point
3. Determine the full expected step sequence based on flags:
   - Without `--strict`: `01-router`, `02-brief`, `03-patch`, `05-review`
   - With `--strict`: `01-router`, `02-brief`, `03-patch`, `04-challenges`, `05-review`
   - The first step absent from the checkpoint list is the resume point
4. For each step **before** the resume point, load the saved output via `node scripts/checkpoint.mjs read --repo <owner/repo> <issueId> <step>` and treat it as the agent's output — **do not re-run the agent**
5. The issue JSON is never checkpointed. Whenever the resume point is `02-brief` or later, re-fetch it with `node scripts/gh-get-issue.mjs <issueId> --repo <owner/repo>` before running any agent that needs it
6. Resume the pipeline from the first missing step, following the same logic as `/issue-code-generation`:

   **`01-router` missing** — fetch the issue JSON with `node scripts/gh-get-issue.mjs <issueId> --repo <owner/repo>`, run `issue-router`, pipe output to `node scripts/checkpoint.mjs write --repo <owner/repo> <issueId> 01-router`, then continue from `02-brief`

   **`02-brief` missing** — re-fetch the issue JSON with `node scripts/gh-get-issue.mjs <issueId> --repo <owner/repo>`, load `01-router` checkpoint, run `ticket-analyst` with the fresh issue JSON, pipe output to `node scripts/checkpoint.mjs write --repo <owner/repo> <issueId> 02-brief`, then continue from `03-patch`

   **`03-patch` missing** — re-fetch the issue JSON with `node scripts/gh-get-issue.mjs <issueId> --repo <owner/repo>`, load `01-router` and `02-brief` checkpoints, run the code-builder variant indicated by the router type, pipe output to `node scripts/checkpoint.mjs write --repo <owner/repo> <issueId> 03-patch`; if `--strict` was passed continue to `04-challenges`, otherwise continue to `05-review`

   **`04-challenges` missing** *(only reached when `--strict` was passed)* — load `03-patch` checkpoint, run `code-challenger` with the patch and original acceptance criteria, pipe output to `node scripts/checkpoint.mjs write --repo <owner/repo> <issueId> 04-challenges`, then continue to `05-review`

   **`05-review` missing** — load `03-patch` checkpoint (and `04-challenges` if `--strict` was passed), run `code-reviewer`, pipe output to `node scripts/checkpoint.mjs write --repo <owner/repo> <issueId> 05-review`

7. Apply the same stop conditions as `/issue-code-generation`: halt on `NEEDS_REVIEW` or `BLOCKED` and surface the output for human decision
8. On completion, present the final patch to the user for review and merge approval

## Notes

- `listCheckpoints` returns steps sorted lexicographically — the `01-` … `05-` numeric prefixes ensure correct order
- `node scripts/checkpoint.mjs write` reads content from stdin to preserve multiline Markdown structure
- If all expected steps are already checkpointed, inform the user that the pipeline is complete and show the `05-review` checkpoint content
- If no checkpoints exist for `<issueId>`, inform the user and suggest running `/issue-code-generation <issueId>` instead
