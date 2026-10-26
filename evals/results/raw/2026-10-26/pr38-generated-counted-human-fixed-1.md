### Status
DONE — `scripts/review-chain-metrics.mjs` is implemented, tested and listed in the README. It is read-only and uses REST only. I found no blocking issues.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md` | PASS — 222/222, 0 failed |
| Lint | — | — | N/A — no linter configured |
| Type-check | — | — | N/A — none configured |
| Builder reproduction / non-regression | — | — | N/A — none supplied (feature) |

I did not run the script against real PRs, because there is no network access and `gh` isn't authenticated. The `gh` I/O in `collectPr` and the CLI is therefore untested. That matches the repo convention for scripts that shell out to `gh`. The pure functions are covered by `tests/review-chain-metrics.test.mjs`.

**AC coverage**
- [x] Add the review-chain-metrics script, with /pr-review → /pr-fixer signals taken from PR history. `scripts/review-chain-metrics.mjs` provides these functions:
  - `parseReport` and `parseFinding` read the report.
  - `buildRecord` produces the per-PR record: rounds, findings touched since the report, human threads beyond the review, CI on head, and time to merge.
  - `aggregate` produces the totals.
  - `collectPr` and the CLI do the I/O.
- [x] The script follows the repo's script conventions:
  - ESM and a CLI guard using `fileURLToPath`.
  - `gh` is called with an args array, with no shell interpolation.
  - Pagination goes through `restList`, which passes `--paginate --slurp`.
  - Unknown values are `null` rather than a default.
  - The tests live in `tests/`.
  - The README scripts table has a new row.

**Bugs / regressions**
- None found. Check-runs pages come back as `{check_runs: []}` objects, and the `flatMap` in `collectPr` handles that.

**Scope violations**
- None. The diff touches only the script, its test and one README row.

**Missing tests**
- None blocking. The `gh` I/O in `collectPr` and the CLI argument handling (`--recent` bounds, positional parsing) are not unit-tested.

**Blocking issues**
- None.

**Non-blocking notes**
- `.claude-plugin/plugin.json` is still at 0.4.1. `CLAUDE.md` says to bump `version` when a change to `scripts/` must reach plugin installs. Bump it if this script should ship to plugin users.
- `nit`: `--recent` includes closed PRs that were never merged. They count as PRs but are `reviewed: false` unless they received a report. That is fine, but worth documenting.
- `nit`: there is no `docs/` reference for the script. This isn't required, since it isn't a command.

### Handoff
Ready for human review and merge. Decide whether to bump the plugin version first.
