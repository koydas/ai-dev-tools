### Status
DONE — the new script meets the AC and all 225 repo tests pass. I found no blocking issues, only two non-blocking notes.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md` (Tests) | PASS — 225/225, including the 19 new tests in `tests/review-chain-metrics.test.mjs` |
| Reproduction | — | — | N/A — no builder `### Reproduction` for this feature |
| Lint | — | — | N/A — no linter configured |
| Type-check | — | — | N/A — plain ESM `.mjs`, no type-checker configured |

**AC coverage**
- [x] Add the `review-chain-metrics` script that reads /pr-review → /pr-fixer signals from PR history: `scripts/review-chain-metrics.mjs` is new.
  - Report parsing is at `:20-45`, per-PR record at `:84-125`, aggregate at `:130-145`, REST collection at `:152-185` and the CLI at `:190-215`.
  - It reuses `classifyComment`, so the trust rule matches /pr-fixer (ADR-014).
  - The CLI detection, `execFileSync` via `gh()`, `--paginate` via `restList`, `null`-for-unknown and the exported-functions-plus-CLI structure all follow the repo conventions.
  - The new script has a README entry and a test file.

**Bugs / regressions**
- None blocking.
- `scripts/review-chain-metrics.mjs:35` — `parseReport` throws when the Status line is unrecognised. `buildRecord` calls it without a guard, so one malformed or odd report makes `collectPr` throw, and the CLI aborts the whole multi-PR run. `collectPr` catches this only when it collects SHAs. It would fit the script's "unknown is `null`" approach to skip or flag that report.

**Scope violations**
- None. The change touches only the new script, its test and one README row.

**Missing tests**
- A `buildRecord` case with a report-shaped comment that has an unparsable Status line (the behaviour in the bug note above).
- `collectPr` and the `--recent` happy path are untested. That is consistent with the repo rule that scripts shelling out to `gh` aren't unit-tested.

**Blocking issues** (must fix before merge)
- None.

**Non-blocking notes**
- Make `buildRecord` tolerate a report that fails to parse (see Bugs).
- The plugin version in `.claude-plugin/plugin.json` (0.4.1) is not bumped. `CLAUDE.md` asks for a bump when a `scripts/` change must reach plugin installs. No command or agent calls this script yet, so you can skip the bump unless you want it shipped.

### Handoff
Ready for human review and merge. Optionally pass the non-blocking notes to /pr-fixer.
