### Status
DONE — the script is implemented, documented in the README and tested. Two non-blocking notes remain, and the live `gh` paths could not be run here.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md` (Tests) | PASS — 221/221, 0 failed |
| Reproduction | — | — | N/A — feature, no builder reproduction section |
| Lint | — | — | N/A — no linter configured |
| Type-check | — | — | N/A — plain ESM `.mjs`, no type-checker configured |

**AC coverage**
- [x] Add the `review-chain-metrics` script — `scripts/review-chain-metrics.mjs`.
- [x] Signals from PR history: rounds per PR, blocking and non-blocking findings and nits, findings "touched" by later commits, evidence results, CI on head, human threads after and beyond the review, time to merge (`buildRecord`, `aggregate`).
- [x] Repo conventions are followed:
  - ESM with an exported API and a CLI entrypoint guarded by `fileURLToPath`.
  - REST only, with pagination through `restList`.
  - Unknown values are `null`, not defaults.
  - The module imports the existing `classifyComment`, `parsePrRef` and `gh-transport` helpers instead of duplicating them.
- [x] Tests are in `tests/review-chain-metrics.test.mjs`, and the script is listed in the `README.md` scripts table.

**Bugs / regressions**
- None found. The existing suite is unaffected, and the diff adds only new files plus one README line.

**Scope violations**
- None.

**Missing tests**
- `collectPr` and the CLI path need an authenticated `gh`, so they are untested. This is acceptable under the repo's rule for scripts that shell out to `gh`.

**Blocking issues** (must fix before merge)
- None.

**Non-blocking notes**
- `.claude-plugin/plugin.json`: `CLAUDE.md` says to bump `version` when a change to `scripts/` must reach plugin installs. If this script should ship to plugin users, bump it.
- `scripts/review-chain-metrics.mjs` (CLI block), `nit`: when `--recent` is given together with positional PR refs, the refs are silently dropped. Either reject the combination or document that `--recent` wins.

### Handoff
Ready for human review and merge. Optionally pass the two non-blocking notes to /pr-fixer.
