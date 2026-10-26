### Status
NEEDS_REVIEW — the script works and its tests pass, but one malformed report can abort a whole run, and the plugin version isn't bumped.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md` | PASS — 221/221 |
| Lint | — | — | N/A — no linter configured or discovered |
| Type-check | — | — | N/A — plain ESM `.mjs` |
| Reproduction | — | — | N/A — this is a feature, not a bug fix |

I didn't run the `gh`-backed paths (`collectPr` and the CLI). There is no network access and the repo doesn't unit-test `gh` scripts.

**AC coverage**
- [x] A `review-chain-metrics` script that derives /pr-review → /pr-fixer signals from PR history is in `scripts/review-chain-metrics.mjs`.
  - It parses reports, counts rounds, and checks whether cited files were touched after each report.
  - It counts human threads beyond the review and CI status on the head commit.
  - It aggregates these across PRs.
  - The pure functions have tests in `tests/review-chain-metrics.test.mjs`.
  - The README scripts table has a new entry.

**Bugs / regressions**
- `scripts/review-chain-metrics.mjs:~76` and `:~150` — `buildRecord` calls `parseReport` on every comment that `classifyComment` labels `pr-review`, and `parseReport` throws on a missing or odd `### Status` value.
  - `isPrReviewReport` only needs a `### Status` heading, a `### Review` heading and `**Evidence**`. It doesn't check the status value.
  - A single malformed or hand-edited report therefore aborts `collectPr`. Because the CLI wraps the whole run in one try/catch, every PR's metrics are lost.
  - `collectPr` already guards the same call in its SHA loop with `try/catch`. `buildRecord` should skip such a report or mark it unknown.

**Scope violations**
- None.

**Missing tests**
- Scenario: a `pr-review`-classified comment with an unparseable Status passed through `buildRecord`. The current test only checks that `parseReport` throws.
- Scenario: the CLI argument handling (`--recent`, `--repo`, positional refs). There are no CLI tests, which is acceptable for a `gh`-dependent path.

**Blocking issues** (must fix before merge)
1. Make `buildRecord` tolerate an unparseable report instead of throwing (see Bugs), and add a test for it.
2. `scripts/` changed but `version` in `.claude-plugin/plugin.json` was not bumped. `CLAUDE.md` requires a bump when a change to `scripts/` must reach plugin installs.

**Non-blocking notes**
- `nit`: `--recent` fetches `state=closed`, which includes PRs closed without merging. These then count as unreviewed PRs in `aggregate().prs`. Consider documenting this or filtering on `merged_at`.
- `nit`: `--recent` ignores any positional PR refs without saying so.
- `nit`: `pr.state` is passed to `buildRecord` but never used.
- `nit`: the script has no `docs/` reference page. This is optional, since `CLAUDE.md` only requires one for commands.

### Handoff
NEEDS_REVIEW: pass blocking issues 1–2 to /pr-fixer or code-builder. /pr-fixer can also apply the in-scope nits.
