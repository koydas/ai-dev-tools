### Status
DONE — `mergeable` is now fetched and mapped, `/pr-review` flags a conflicting PR, and `/pr-fixer` stops on one. The Node tests pass (246/246).

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md` (Tests) | PASS — 246/246 |
| Lint | — | — | N/A — no linter configured or documented in `CLAUDE.md` |
| Type-check | — | — | N/A — plain ESM `.mjs`, no type-check configured |
| Builder reproduction / non-regression | — | — | N/A — none provided |

**AC coverage**
- [x] `/pr-review` reports a conflicting PR. `commands/pr-review.md` step 2 says that on `CONFLICTING` the review still runs on the diff, the report's first line says so, and it points to the Conflicts Fix workflow or a manual merge. `docs/commands/pr-review.md` is updated to match. The data comes from `scripts/gh-get-pr.mjs:39` (`mergeable` added to `FIELDS`) and `scripts/gh-get-pr.mjs:82` (REST mapping).
- [x] `/pr-fixer` stops on a conflicting PR. `commands/pr-fixer.md` step 1b stops with `NEEDS_REVIEW` before changing anything and points to the Conflicts Fix workflow or a manual merge. `docs/commands/pr-fixer.md` is updated to match.
- [x] Handoff from the loop's conflicts-fix. `docs/consumer-repos.md` has a new "Handoff from the loop's `needs-human`" section. It covers the `conflicts-fix` comment, the manual merge, and resuming with `/pr-review` and `/pr-fixer`.
- [x] The REST fallback follows ADR-011. `true` maps to `MERGEABLE`, `false` to `CONFLICTING`, and null or absent stays `null` rather than a default. `tests/gh-get-pr.test.mjs` covers all four cases, and the existing expectations in `tests/gh-get-pr.test.mjs` and `tests/normalize-pr.test.mjs` are updated.
- [x] The plugin version is bumped from 0.4.2 to 0.4.3, as `CLAUDE.md` requires for changes to `commands/` and `scripts/`.

**Bugs / regressions**
- None found. `mergeable` is an added field, so existing consumers are unaffected.

**Scope violations**
- None. Every changed file belongs to the feature: the two commands, their docs, `gh-get-pr.mjs` with its tests, `consumer-repos.md` and the version bump.

**Missing tests**
- None blocking. The two command behaviours are Markdown pipeline instructions, which the repo does not unit-test.

**Blocking issues** (must fix before merge)
- None.

**Non-blocking notes**
- `nit`: the step is numbered `1b` in `commands/pr-fixer.md`, while the later steps stay 2, 3, and so on. Renumbering would be cleaner.
- `nit`: on the REST or MCP fallback path, `mergeable` is `null` when GitHub has not computed it yet. In that case neither command flags a conflict. This matches ADR-011 and the GraphQL `UNKNOWN` case, but `pr-fixer.md` could say that `null` or `UNKNOWN` proceeds normally.
- I could not check that `/sync-ai-dev-tools` was run to deploy the edited `commands/` files to `~/.claude`, as `CLAUDE.md` requires.

### Handoff
Ready for human review and merge.
