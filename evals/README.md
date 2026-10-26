# Evals

Datasets of real defects, graded deterministically (no LLM judge).

## `code-reviewer/cases.json`

Each case is a finding that a reviewer raised on a merged PR and that a later commit fixed:

| Field | Meaning |
|---|---|
| `base` / `head` / `fixed_head` | `head` = PR state where the defect existed, `fixed_head` = the fix commit (always `head`'s child), `base` = merge base |
| `ac` | Acceptance criteria given to the reviewer (the PR title) |
| `finding.path` / `finding.pattern` | A review item "reports the finding" when it names the path and matches the regex (case-insensitive) |

Two variants per case, graded by `scripts/eval-grade.mjs`:

- `defect` — review of `head`: pass = Status `NEEDS_REVIEW` and a *Bugs / regressions* or *Blocking issues* item reports the finding (recall).
- `fixed` — review of `fixed_head`: pass = the finding is not reported again (false positive on the fixed code).

An output that breaks the ADR-003 contract (`scripts/check-agent-output.mjs`) never passes.

## Rules

- A case is added in the PR that fixes a real misjudgment; `source` names the PR. Never copy a case's wording into an agent prompt.
- A case is never removed, relabelled or loosened (`pattern`) to make a run pass; a wrong label is corrected in its own PR.
- `tests/eval-grade.test.mjs` checks the schema and, when the commits are present, that the path is in the `base..head` diff and touched by the fix (CI checks out the full history for that).
