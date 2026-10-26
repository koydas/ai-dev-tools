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

## Running

```bash
node scripts/eval-run.mjs --dry-run                       # plan and worst-case cost, no call
node scripts/eval-run.mjs [--case <id>] [--variant defect|fixed|both] [--runs 3] [--model <m>] [--effort <level>]
node scripts/eval-run.mjs --regrade evals/results/<date>-code-reviewer.json   # re-grade saved outputs, no LLM call
```

Manual only (calls `claude -p`: ~0.1 USD and ~20 s per run; not in CI). Each run reviews an isolated repo holding the reviewed commit and its ancestors, so the fix cannot be read from git. The agent gets Bash without a command allowlist (an allowlist denied compound commands such as `node --test | tail` and made the reviewer report "tests not executed"); this is not a sandbox, so run it on these cases only. Results: `--out` (default `evals/results/<date>-code-reviewer.json`; an existing file is refused unless `--overwrite`), committed: summary, per-run grade, cost, `denials`, and `raw_dir`. Raw outputs go to `raw/<results name>/` beside it (git-ignored, needed by `--regrade`), so two experiments never share a directory; `raw_dir` records where. `--regrade <file>` defaults to that file (in place) and its `raw_dir`, whatever the date.

A run's `pass` can be wrong when the grader is: a `pattern` that is too loose pairs an item about another bug with the finding; too tight misses a paraphrase. Fix the pattern with `--regrade` against the saved outputs, never against the pass rate you want.

## Baseline — 2026-10-26, n = 1 per case

| Variant | Passed | Meaning |
|---|---|---|
| `defect` | 0 / 12 | The reviewer did not report any of the 12 defects (10 runs ended `DONE`; 2 raised a different, real bug) |
| `fixed` | 12 / 12 | No false positive on the fixed code — but a reviewer that flags nothing passes this too |

Single run per case: the variance is unmeasured (`--runs 3` before drawing conclusions on a change). Models seen: `claude-sonnet-5-5` with `claude-haiku-5-5` subtasks (the session default; pass `--model` to pin one).
