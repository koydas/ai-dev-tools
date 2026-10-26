### Status
DONE — the script is implemented and tested, and the full suite passes. There are no blocking issues, but there are a few non-blocking notes.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md`, `ci.yml` | PASS — 222/222 (includes the 14 new `tests/review-chain-metrics.test.mjs` tests) |
| Lint | — | — | N/A — no linter configured (no `package.json`, no lint step in CI) |
| Type-check | — | — | N/A — none configured |

**AC coverage**
- [x] Add the `review-chain-metrics` script that extracts /pr-review → /pr-fixer signals from PR history. It is implemented in `scripts/review-chain-metrics.mjs`.
  - It reads report rounds, blocking and non-blocking findings, and whether the cited files were touched by later commits.
  - It also reads human threads beyond the review, CI on the head commit, and time to merge.
  - It has the standard CLI entrypoint check and a documented `null` for unknown values.
- [x] It follows the repo script conventions: ESM, `execFileSync` through `gh`, `--paginate --slurp` through `restList`, REST only, and the shared `classifyComment` trust rules.
- [x] The tests cover the pure functions and the CLI argument errors.
- [x] `README.md` has a new row in the scripts table.

**Bugs / regressions**
- None blocking. I found no regressions: the diff only adds files and one README row.

**Scope violations**
- None.

**Missing tests**
- A trusted comment that passes `isPrReviewReport` but has an unparseable `### Status` line (for example `### Status\nREADY`) is not tested. See the first non-blocking note.
- `collectPr` and the `--recent` path need an authenticated `gh`, so they have no unit tests, which the repo allows.

**Blocking issues** (must fix before merge)
- None.

**Non-blocking notes**
- `scripts/review-chain-metrics.mjs:127` (`buildRecord`): `parseReport` throws on a report with no recognised Status value. `collectPr` guards that call, but `buildRecord` doesn't. One odd report would abort the whole multi-PR run, because the outer `try` exits with code 1. Consider skipping or flagging that report instead.
- `.claude-plugin/plugin.json` is still at 0.4.1. `CLAUDE.md` says to bump the version when a change to `scripts/` must reach plugin installs. Bump it if this script is meant to ship to installs.
- `--recent` silently replaces any positional PR refs that were also given. `nit`: reject the combination or document it.
- `--recent` takes the latest closed PRs, which includes ones closed without merging. They count as `prs` but have no merge time. `nit`.
- There is no `docs/` page for the script. Commands require one, but scripts don't, so this is optional.

### Handoff
Ready for human review and merge. Optionally pass the non-blocking notes to /pr-fixer.
