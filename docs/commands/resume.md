# /resume

Resume an interrupted `/issue-code-generation` run from its first missing checkpoint.

## Purpose

`/issue-code-generation` writes one checkpoint per completed step (`01-router`, `02-brief`, `03-patch`, `04-challenges` with `--strict`, `05-review`). After a rate limit or a crash, `/resume` reloads the steps already done and runs only the ones that are missing, so a finished agent is never re-run.

## Invocation

```
/resume <issueId> --repo <owner/repo> [--strict]
```

- `--repo` is required and must match the repository of the original run: checkpoints are namespaced by repository, so two repositories with the same issue number do not collide.
- Pass `--strict` if the original run used it. It is required so that `code-challenger` is not skipped when a strict run was interrupted before `04-challenges` was written.

## What it does

1. Lists the completed steps with `scripts/checkpoint.mjs list` and shows them so you can confirm the resume point
2. Builds the expected sequence — `01-router`, `02-brief`, `03-patch`, `05-review`, with `04-challenges` before `05-review` under `--strict` — and takes the first absent step as the resume point
3. Loads the saved output of every earlier step (`checkpoint.mjs read`) and treats it as the agent's output
4. Re-fetches the issue JSON (`scripts/gh-get-issue.mjs`) from `02-brief` on: the issue is never checkpointed
5. Runs the missing steps with the same agents and the same logic as `/issue-code-generation`, writing each output back with `checkpoint.mjs write`
6. Applies the same stop conditions: it halts on `NEEDS_REVIEW` or `BLOCKED` and surfaces the output for a human decision
7. On completion, presents the final patch for review and merge approval

## Edge cases

- If every expected step is already checkpointed, it says so and shows the `05-review` checkpoint
- If no checkpoint exists for the issue, it says so and suggests `/issue-code-generation <issueId>`

## Output

The final patch, presented for review and merge approval, with the output of the `05-review` step. Nothing is committed or pushed.

## Human gates

1. **Invocation** — you decide to resume, and the resume point is shown for confirmation
2. **`NEEDS_REVIEW` / `BLOCKED`** — the pipeline stops there, as in the original run
3. **Merge** — nothing is committed automatically
