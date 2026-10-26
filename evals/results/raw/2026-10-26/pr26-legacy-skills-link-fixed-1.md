### Status
DONE — the conventions are now path-scoped Claude Code rules as ADR-015 describes. All 116 tests pass. There are no blocking issues.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md` (Tests) | PASS — 116/116, including the new `tests/rules.test.mjs` and the ADR-013 script-path test |
| Reproduction / non-regression | — | no builder evidence supplied | N/A |
| Lint | — | — | N/A — no linter configured |
| Type-check | — | — | N/A — plain ESM, no type-checker configured |

**AC coverage**
- [x] `skills/` becomes `rules/`. The seven files moved with `git mv` and kept their content.
- [x] The three stack-specific rules are path-scoped through `paths:` frontmatter.
  - `dotnet-repository` matches `*.cs`, `*.csproj` and `*.sln`.
  - `vue-ui` and `vue-service` match `*.vue` plus the `.ts`/`.js` files under their `src/` directories.
- [x] `scope-guard`, `wiki-first`, `git-conventions` and `branch-pr` have no `paths:`, so they load every session.
- [x] `workspace/CLAUDE.md` no longer uses the unconditional `@~/.claude/skills/...` imports. It documents how the rules load. `workspace/.claude/CLAUDE.md` now says "apply the `x` rule" instead of "read `x.md`".
- [x] Onboarding links `~/.claude/rules/ai-dev-tools/` to the repo's `rules/` in `scripts/onboarding.mjs`.
  - It removes the legacy `~/.claude/skills` link when that link points at this clone's `skills/` or at an older `skills/` that holds `scope-guard.md`.
  - It replaces stale or dangling rules links.
  - It refuses to overwrite a real directory.
  - It builds the Windows junction with `execFileSync`, so there is no shell injection.
- [x] `ADR-015` is added and `CLAUDE.md`, `README.md` and the other ADRs and command docs are updated. `tests/rules.test.mjs` checks the `paths:` frontmatter and that no flat `skills/` directory remains.

**Bugs / regressions**
- None found.
- `removeLegacySkillsLink` and `linkRules` have no unit tests. That matches the repo convention that I/O scripts aren't unit-tested.

**Scope violations**
- None. Every changed file belongs to the rules migration.

**Missing tests**
- None required. Some `onboarding.mjs` edge cases (dangling link, relocated clone) are untested, but they would need a filesystem fixture.

**Blocking issues**
- None.

**Non-blocking notes**
- `nit`: `docs/adr/ADR-002-three-primitive-architecture.md:28` still lists `skills/` as a directory. ADR-006 line 20 also still says skills are stored in `skills/`. If the history is meant to stay as written, add a "superseded by ADR-015" pointer.
- `nit`: `.claude-plugin/plugin.json` `version` was not bumped, although `scripts/` and `agents/` or `commands/` may have changed. Bump it only if those changes need to reach plugin installs.

### Handoff
Ready for human review and merge. The notes above are optional follow-ups for /pr-fixer.
