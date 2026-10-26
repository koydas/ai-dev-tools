### Status
DONE — `/pr-review` flags a `CONFLICTING` PR, `/pr-fixer` stops with `NEEDS_REVIEW` on one, and the loop handoff is documented. All checks pass.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md` | PASS — 247/247, 0 fail |
| Lint | — | — | N/A — no linter configured |
| Type-check | — | — | N/A — no type-checker configured |
| Reproduction / Non-regression | — | — | N/A — builder supplied no evidence section |

**AC coverage**
- [x] `/pr-review` reports a conflicting PR. `commands/pr-review.md` step 2 puts a conflict notice on the report's first line and points to the Conflicts Fix workflow or a manual merge. `docs/commands/pr-review.md` matches. The review still runs on the diff.
- [x] `/pr-fixer` handles a conflicting PR. `commands/pr-fixer.md` step 1b stops with `NEEDS_REVIEW` before any change. `docs/commands/pr-fixer.md` matches.
- [x] Handoff from the loop's conflicts-fix. `docs/consumer-repos.md` has a new "Handoff from the loop's `needs-human`" section.
- [x] Data source: `scripts/gh-get-pr.mjs` adds `mergeable` to the `gh pr view` fields.
  - The REST fallback maps `true` to `MERGEABLE`, `false` to `CONFLICTING` and absent/null to `null`. This follows ADR-011: unknown is `null`, never a default.
  - A branch lookup now re-reads the PR itself, because the list endpoint omits `mergeable`.
- [x] Tests: `mapRestPr` mergeable mapping, `getPrRest` lookup order (via injected transport) and the updated `normalizePr` expectation.
- [x] The plugin version is bumped to 0.4.3, as required for changes to `commands/` and `scripts/`.

**Bugs / regressions**
- None found. The branch lookup in `getPrRest` costs one extra API call, which is intended. The `gh` (GraphQL) path is unchanged apart from the extra field.

**Scope violations**
- None.

**Missing tests**
- None blocking. The command-markdown behaviour (the first-line notice, the stop) isn't unit-testable, which is expected for this repo.

**Blocking issues**
- None.

**Non-blocking notes**
- nit: `commands/pr-fixer.md` numbers the new step "1b" while the rest are 1–N. Renumbering would be cleaner, but the docs reference "0." and "1." separately, so it's harmless.
- nit: `mergeable: null` (REST fallback or not yet computed) and `UNKNOWN` are not treated as conflicts, so neither command flags or stops on them. This is consistent with the "unknown" rule, but worth knowing.
- I didn't run `/sync-ai-dev-tools`, which `CLAUDE.md` requires after changes to `commands/`, so confirm it was run.

### Handoff
Ready for human review and merge.
