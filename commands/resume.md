# /resume

Resume an interrupted `/issue-code-generation` pipeline from the first missing checkpoint.

## Invocation

```
/resume <issueId>
```

## Steps

1. Run `node scripts/checkpoint.mjs list <issueId>` to get the list of already-completed steps
2. Display the completed steps to the user so they can confirm the resume point
3. Determine the first missing step from the ordered sequence:
   - `01-router`
   - `02-brief`
   - `03-patch`
   - `04-challenges` (only if `--strict` was originally used — infer from presence of its checkpoint)
   - `05-review`
4. For each step **before** the first missing one, load the saved output via `node scripts/checkpoint.mjs read <issueId> <step>` and treat it as the agent's output — **do not re-run the agent**
5. Resume the pipeline from the first missing step, following the same logic as `/issue-code-generation`:

   **`01-router` missing** — fetch the issue with `node scripts/gh-get-issue.mjs <issueId>`, run `issue-router`, write checkpoint `01-router`, then continue from `02-brief`

   **`02-brief` missing** — load `01-router` checkpoint, run `ticket-analyst` with the original issue JSON, write checkpoint `02-brief`, then continue from `03-patch`

   **`03-patch` missing** — load `01-router` and `02-brief` checkpoints, run the code-builder variant indicated by the router type, write checkpoint `03-patch`; if `04-challenges` was part of the original run (checkpoint exists or `--strict` is passed), continue to `04-challenges`; otherwise continue to `05-review`

   **`04-challenges` missing** — load `03-patch` checkpoint, run `code-challenger` with the patch and original acceptance criteria, write checkpoint `04-challenges`, then continue to `05-review`

   **`05-review` missing** — load `03-patch` checkpoint (and `04-challenges` if present), run `code-reviewer`, write checkpoint `05-review`

6. After each newly-run agent, call `node scripts/checkpoint.mjs write <issueId> <step> <output>` before proceeding to the next step
7. Apply the same stop conditions as `/issue-code-generation`: halt on `NEEDS_REVIEW` or `BLOCKED` and surface the output for human decision
8. On completion, present the final patch to the user for review and merge approval

## Notes

- `listCheckpoints` returns steps sorted lexicographically — the `01-` … `05-` numeric prefixes ensure correct order
- If all five steps (or four, when `--strict` was not used) are already checkpointed, inform the user that the pipeline is complete and show the `05-review` checkpoint content
- If no checkpoints exist for `<issueId>`, inform the user and suggest running `/issue-code-generation <issueId>` instead
