### Status
DONE — the new script covers the AC and all 218 tests pass. I found no blocking issues, only a few non-blocking notes.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md` (Tests) | PASS — 218/218, including the 12 new tests in `tests/review-chain-metrics.test.mjs` |
| Reproduction / non-regression | — | no builder evidence supplied (feature) | N/A |
| Lint | — | — | N/A — no linter documented in `CLAUDE.md` |
| Type-check | — | — | N/A — plain ESM JavaScript, no type-check configured |

I did not run the `gh`-backed paths (`collectPr` and the CLI's `--recent` mode). They need an authenticated `gh` and network access, and `CLAUDE.md` says such scripts are not unit-tested.

**AC coverage**
- [x] Add the `review-chain-metrics` script that extracts /pr-review → /pr-fixer signals from PR history.
  - `scripts/review-chain-metrics.mjs` computes these signals:
    - rounds
    - blocking and non-blocking counts
    - whether the cited files were touched by later commits
    - human threads beyond the review
    - CI on the head commit
    - convergence
  - It reuses `classifyComment` and `parsePrRef`, so only trusted authors' reports count.
  - Unknown values come out as `null` rather than a default.
  - The pure functions are exported, there is a CLI entrypoint, and the README scripts table has a row.

**Bugs / regressions**
- None blocking.
- `scripts/review-chain-metrics.mjs:~76`: `buildRecord` calls `parseReport` on every comment that `classifyComment` labels `pr-review`, with no try/catch. `collectPr` does guard that same call when it scans for SHAs. A report whose Status line lacks `DONE`, `NEEDS_REVIEW` or `BLOCKED` therefore throws inside `buildRecord`. That aborts the whole multi-PR run, with the CLI reporting an error and exiting 1.

**Scope violations**
- None. The change touches only the new script, its test and one README row.

**Missing tests**
- A malformed `pr-review` comment passed to `buildRecord` (the failure above).
- Nothing covers `--recent` or `collectPr`, which is consistent with the repo's policy on `gh`-dependent code.

**Blocking issues** (must fix before merge)
- None.

**Non-blocking notes**
- Make `buildRecord` skip, or record as unknown, a report that fails to parse, instead of throwing.
- `--recent` calls `gh api …/pulls?state=closed&per_page=N` without `--paginate`, which `CLAUDE.md` requires. It silently caps N at 100 and includes closed-but-unmerged PRs. It also discards any positional refs given alongside it.
- `.claude-plugin/plugin.json` is still at 0.4.1. Bump `version` if this script should reach plugin installs, since the change is under `scripts/`.
- `nit`: the usage text and README don't mention that `--recent` overrides positional refs.

### Handoff
Ready for human review and merge. `/pr-fixer` can apply the non-blocking notes if wanted.
