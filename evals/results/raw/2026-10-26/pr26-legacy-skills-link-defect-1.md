### Status
DONE — conventions moved from `skills/` to path-scoped rules as ADR-015 describes. All checks pass and I found no blocking issues.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md` (Tests) | PASS — 116/116 |
| Syntax | `node --check scripts/onboarding.mjs` | — | PASS |
| Lint | — | — | N/A — no linter configured |
| Type-check | — | — | N/A — none configured (plain `.mjs`) |
| Reproduction / non-regression | — | — | N/A — the builder gave no such evidence |

**AC coverage**
- [x] Conventions become Claude Code rules
  - The seven files moved `skills/` → `rules/`; git shows them as renames. The `skills/` directory is gone, and `tests/rules.test.mjs:44` asserts that.
- [x] Path scoping
  - `rules/dotnet-repository.md`, `rules/vue-ui.md` and `rules/vue-service.md` now carry `paths:` frontmatter.
  - `scope-guard`, `wiki-first`, `git-conventions` and `branch-pr` have none, so they load every session.
  - `tests/rules.test.mjs` checks the frontmatter.
- [x] ADR-015 added
  - `docs/adr/ADR-015-conventions-as-path-scoped-rules.md` is new. ADR-006 is marked superseded by it.
- [x] Loading and onboarding updated
  - `workspace/CLAUDE.md` replaces the `@~/.claude/skills/...` imports with a rules table.
  - `scripts/onboarding.mjs` now links `~/.claude/rules/ai-dev-tools/` → `<repo>/rules/`.
  - It removes the legacy `skills` link only if that link points at the repo's old `skills/` directory.
  - It replaces a stale or dangling rules link, and throws if the destination is a real directory.
  - The Windows junction call moved from `execSync` to `execFileSync`, which matches the repo's security convention.
- [x] Root docs updated: `CLAUDE.md`, `README.md`, the command docs and the ADR cross-references.

**Bugs / regressions**
- None found.

**Scope violations**
- None. The `onboarding.mjs` hardening (the `execFileSync` switch and the stale-link handling) goes beyond a pure rename. It is needed for the migration and is the repo's own convention.

**Missing tests**
- `linkRules`, `removeLegacySkillsLink` and `linkTarget` in `scripts/onboarding.mjs` have no unit tests. They are filesystem logic that could be tested in a temp directory, and they only run via the CLI. The repo's rule is "Add `tests/<script>.test.mjs` … whose logic is testable without an external CLI". Non-blocking.

**Blocking issues** (must fix before merge)
- None.

**Non-blocking notes**
- `nit`: `.claude-plugin/plugin.json` stays at `0.2.0` although `scripts/onboarding.mjs` changed. The convention is to bump only when the change must reach plugin installs. Onboarding is a local setup script, so skipping is likely fine; confirm.
- `nit`: `docs/adr/ADR-002-three-primitive-architecture.md:28` still lists `skills/` as a directory, and `docs/adr/ADR-013-plugin-distribution-and-script-paths.md:12` still says "skills symlink". The first is part of the primitive naming; the second is historical. Update the first if you want it consistent.
- `nit`: the body of `docs/adr/ADR-006-claude-md-as-workspace-orchestrator.md` still says "skills" throughout. That is acceptable for a superseded ADR.

### Handoff
Ready for human review and merge. Optionally add a temp-directory test for the `onboarding.mjs` link helpers.
