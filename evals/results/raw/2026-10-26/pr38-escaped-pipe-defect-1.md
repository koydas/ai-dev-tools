### Status
NEEDS_REVIEW — the tests pass, but one malformed report aborts the whole batch run, and there are no tests for `collectPr` or the CLI.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md` | PASS — 225/225 (includes the new `tests/review-chain-metrics.test.mjs`) |
| Reproduction | — | — | N/A — the change is a feature, not a bug fix |
| Lint | — | — | N/A — no linter configured |
| Type-check | — | — | N/A — no type-check configured |
| Malformed-report probe | `buildRecord` called with a report body whose `### Status` line is not DONE, NEEDS_REVIEW or BLOCKED | ad hoc | FAIL — throws `report has no ### Status line` |

**AC coverage**
- [x] Add a `review-chain-metrics` script that reads PR history for `/pr-review` → `/pr-fixer` signals. This is `scripts/review-chain-metrics.mjs`. It parses the reports, counts rounds, blocking and non-blocking findings and nits, and counts findings whose file a later commit touched. It also counts human threads beyond the review, CI on head and time to merge, and aggregates them. The README row is added and the tests cover the pure functions.

**Bugs / regressions**
- `scripts/review-chain-metrics.mjs:36` and `:103` — `buildRecord` calls `parseReport` without a guard, and `parseReport` throws when the Status line is missing. `classifyComment` accepts any trusted comment that has `### Status`, `### Review` and `**Evidence**`. A report whose Status value is outside the three expected values therefore passes the filter, and the throw propagates to the CLI catch. One such comment in one PR aborts the whole multi-PR or `--recent` run with no output. `collectPr` already guards the same call with try/catch (~line 160), so the two are inconsistent. A bad report should be skipped, or the PR's fields set to `null`.

**Scope violations**
- None.

**Missing tests**
- Scenario: a trusted comment that looks like a report but has an unparseable Status. The run should degrade gracefully instead of throwing.
- `collectPr` and the CLI (`--recent` validation, `parsePrRef` handling) have no tests. This is acceptable because they need `gh`, but the `--recent` bounds check could be extracted and tested.

**Blocking issues** (must fix before merge)
1. Make `buildRecord` tolerate a report that `parseReport` rejects, so one malformed comment does not abort the run. Add a test for it.

**Non-blocking notes**
- Plugin version: `CLAUDE.md` says to bump `.claude-plugin/plugin.json` (currently 0.4.1) when a change to `scripts/` must reach plugin installs. Decide whether this script should reach them. If it should, bump the version.
- `scripts/review-chain-metrics.mjs` (`--recent` fetch) — `gh api` is called without `--paginate`. The single page is bounded by `per_page` ≤ 100, so this is intentional and acceptable. `--recent` also includes closed PRs that were never merged.
- `--repo` or `--recent` given as the last argument with no value yields `undefined` silently. A usage error would be clearer. (nit)

### Handoff
NEEDS_REVIEW: pass blocking issue 1 to /pr-fixer or back to code-builder. /pr-fixer can also apply the non-blocking notes.
