### Status
DONE — the script meets the AC: `scripts/review-chain-metrics.mjs` extracts the /pr-review → /pr-fixer chain metrics from PR history. The full suite passes. The blocking issues list is empty, but a few non-blocking defects are noted below.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md` (Tests) | PASS — 218/218, including the new `tests/review-chain-metrics.test.mjs` |
| Lint | — | — | N/A — no linter configured |
| Type-check | — | — | N/A — none configured (plain ESM `.mjs`) |
| Reproduction / Non-regression | — | — | N/A — no builder evidence supplied (feature) |

I did not run `collectPr` or the CLI against live GitHub. There is no network access, and the repo does not unit-test `gh`-backed code.

**AC coverage**
- [x] Script that extracts /pr-review → /pr-fixer signals from PR history: `scripts/review-chain-metrics.mjs`.
  - It parses reports, counts rounds, and counts findings touched since the report.
  - It also counts human threads beyond the review, CI on head, and time to merge.
  - Pure functions (`parseFinding`, `parseReport`, `buildRecord`, `aggregate`, …) are exported and tested.
- [x] Conventions: ESM, `fileURLToPath` CLI guard, REST only with `--paginate` (via `restList`), `null` for unknown fields, `execFileSync` through `gh-transport`, README script table updated.

**Bugs / regressions**
- None blocking.

**Scope violations**
- None. The diff touches only the script, its test and a README row.

**Missing tests**
- `collectPr` and the CLI are untested. This is accepted by the repo's `gh` rule.

**Blocking issues**
- None.

**Non-blocking notes**
- `scripts/review-chain-metrics.mjs` (`section(body, 'Non-blocking suggestions')`): the `code-reviewer` agent emits `**Non-blocking notes**`, not `suggestions`. Reports from that agent will silently count 0 non-blocking findings. Accept both titles.
- `scripts/review-chain-metrics.mjs` (`buildRecord` → `parseReport`): a trusted comment that classifies as a report but has an unparseable status value throws. That aborts the whole run for every PR, not just the one record. Catch it per comment, or per PR in the CLI loop.
- `scripts/review-chain-metrics.mjs` (CLI): `--recent` silently overrides positional PR refs. `--recent 0` gives `per_page=0`. The closed-PR list includes unmerged PRs, which is probably fine but undocumented. `nit`
- `scripts/review-chain-metrics.mjs` (CLI): the `--recent` request uses `gh api` without `--paginate`. That is capped at 100 by design, but the usage text doesn't say so. `nit`
- `.claude-plugin/plugin.json`: the version was not bumped, although `scripts/` changed. `CLAUDE.md` asks for a bump only when the change must reach plugin installs, so this is a maintainer call. `nit`

### Handoff
Ready for human review and merge. `/pr-fixer` can apply the non-blocking notes.
