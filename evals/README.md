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

Enforced by `node scripts/eval-floor.mjs` (in `node --test` through `tests/eval-floor.test.mjs`, so in CI):

- **Cases only grow and never change.** Every case is pinned in `tests/fixtures/eval-floor.json` (a fingerprint of its id, source, AC, three SHAs, finding path and pattern; `finding.summary` is prose and may be reworded). Adding a case = add it and its pin (`node scripts/eval-floor.mjs --print-pins`). Removing one, or editing a pinned field, fails. A label that is wrong on its own merits is corrected in its own PR, with the pin, never to make a run pass; a `pattern` is changed only after `--regrade` shows on the saved outputs that it mis-grades.
- **The floor only tightens.** `evals/code-reviewer/floor.json` (`min_defect_rate`, `min_fixed_rate`) may not go below the floor pinned in the same fixture. Raise both together when a change improves the agent.
- **The committed results are evidence.** The newest `evals/results/*.json` (latest `generated` timestamp, not file name; a file that is not valid JSON or has no `generated` is itself a violation) must cover every case in both variants, hold no errored run and no denied tool call, carry a `summary` equal to the one recomputed from its runs, and meet the floor. A PR that adds a case therefore re-runs the eval (~0.1 USD per run) and commits the new file.
- **A production misjudgment becomes a case, in the PR that fixes it.** A wrong verdict or a missed bug seen on a real PR gets a case reproducing it (`source` names the PR; real SHAs; the finding as the reviewer should have raised it). If no fix is planned yet, open an issue labelled `eval-case` naming the input and the expected outcome. A case is never copied into an agent prompt.

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
