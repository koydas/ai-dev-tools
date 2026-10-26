### Status
DONE — `review-chain-metrics.mjs` is implemented and tested, and the full suite passes. I found no blocking issues, only one non-blocking note about the plugin version.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md` | PASS — 225/225, including the new `tests/review-chain-metrics.test.mjs` |
| Lint | — | — | N/A — no linter configured |
| Type-check | — | — | N/A — plain ESM JavaScript |
| Reproduction / non-regression | — | — | N/A — no builder evidence was provided |

I did not run the CLI against a live PR, because there is no network access and `gh` is not authenticated.

**AC coverage**
- [x] Add a review-chain-metrics script that extracts /pr-review → /pr-fixer signals from PR history. It is in `scripts/review-chain-metrics.mjs`.
  - **Report parsing:** `parseReport` and `parseFinding` read the report format in `agents/pr-analyst.md`. The `**Branch**: … @ <sha>` line, the `**Blocking issues**` and `**Non-blocking suggestions**` headings and the Evidence table all match that agent's output.
  - **Per-PR record:** `buildRecord` produces the rounds, the findings touched since each report, the human threads beyond the review, the CI summary for the head commit and the time to merge.
  - **Aggregate:** `aggregate` totals these across PRs.
  - **Unknown values:** a value the PR history cannot provide is `null`, never a default.
  - **Reused code:** `classifyComment` and `parsePrRef` are reused, and the human-thread rule matches `/pr-fixer`.
- [x] The script follows the repo's script conventions:
  - It exports its main functions and has a CLI entrypoint checked with `fileURLToPath`.
  - It uses `gh api --paginate --slurp` through `restList`. The check-runs response is an object, and the `flatMap` over `check_runs` handles that correctly.
  - It is REST-only, so the GraphQL fallback rule does not apply.
  - It adds no external dependencies.
- [x] It has a unit test file, and the README scripts table has a row for it.

**Bugs / regressions**
- None found.

**Scope violations**
- None. The change touches only the script, its test file and one README row.

**Missing tests**
- None blocking. The `gh`-dependent `collectPr` and the CLI block are untested, as the repo convention allows.

**Blocking issues**
- None.

**Non-blocking notes**
- `.claude-plugin/plugin.json` `version` is not bumped, although `CLAUDE.md` says to bump it when a change to `scripts/` must reach plugin installs. Bump it if this script should ship to installs.
- `nit`: the Evidence parser splits table rows on `|`. A command cell containing a literal `|` shifts the columns, so that row is skipped and not counted.
- `nit`: `--recent` takes one REST page of closed PRs, and its `--recent <n>` value silently replaces any positional PR refs. This is acceptable, but the usage text could say so.

### Handoff
Ready for human review and merge. Optionally apply the plugin version bump first.
