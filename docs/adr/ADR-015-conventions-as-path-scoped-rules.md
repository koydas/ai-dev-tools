# ADR-015 — Conventions as Path-Scoped Claude Code Rules

**Status:** Accepted  
**Date:** 2026-10-19  
**Supersedes:** ADR-006 (skill routing) · **Amends:** ADR-002 (primitive renamed), ADR-013 (last paragraph)

## Context

ADR-006 had the workspace `CLAUDE.md` inject convention files ("skills") conditionally, by the file paths being touched. The implementation was a list of `@~/.claude/skills/<name>.md` imports under headings such as `### C# / .NET files`. Claude Code expands `@` imports at launch, unconditionally; a Markdown heading is not a condition. Every convention was loaded in every session — the "load all skills always" alternative ADR-006 rejected.

The name collided with the industry term too. An Agent Skill (Claude Code, Claude API, agentskills.io) is a directory `<name>/SKILL.md` with `name` + `description` frontmatter, loaded on demand when the model judges the description relevant. `skills/*.md` here were flat files without frontmatter: Claude Code's skill scanner ignored them, and the `~/.claude/skills/` symlink occupied the directory where the user's real skills live.

Claude Code has a native mechanism for exactly what ADR-006 described: rules (`~/.claude/rules/*.md`, discovered recursively, symlinks followed). A rule without frontmatter loads every session; a rule with `paths:` (glob list) loads when Claude reads or edits a matching file.

## Decision

1. **`skills/` becomes `rules/`.** The primitive is a *rule*: passive context encoding conventions, not logic (ADR-002 otherwise unchanged).
2. **Scoping is `paths:` frontmatter**, the only field Claude Code reads on a rule. `dotnet-repository` → `*.cs`, `*.csproj`, `*.sln`; `vue-ui` / `vue-service` → `*.vue` and their `src/` directories. `scope-guard`, `wiki-first`, `git-conventions`, `branch-pr` carry none and load every session — "git operation" is not a file path, so the git rules cannot be scoped.
3. **Onboarding links `~/.claude/rules/ai-dev-tools/` → `<repo>/rules/`** (junction on Windows) — a subdirectory, so the user's own rules and skills keep their directories. It removes the pre-ADR-015 `~/.claude/skills` link when, and only when, it points at `<repo>/skills`.
4. **The workspace `CLAUDE.md` imports nothing**; it documents which rule loads when.
5. **`tests/rules.test.mjs`** fails on a rule whose frontmatter is not exactly a non-empty `paths` list: invalid YAML makes Claude Code load the rule unconditionally, without an error.

The plugin still does not ship conventions: a plugin carries skills, not rules.

## Consequences

**Positive**
- Path-scoped conventions actually stay out of unrelated sessions.
- Native mechanism: no routing prose for the model to interpret, visible in `/memory`.
- No name clash with Agent Skills; `~/.claude/skills/` is free for real skills.

**Negative** — detailed in *What we lose* below.

## What we lose

Accepted losses. Each names what triggers it and what, if anything, compensates.

| # | Loss | When it bites | Mitigation |
|---|---|---|---|
| 1 | **No convention while planning.** A path-scoped rule enters the context on the first Read/Write/Edit of a matching file (or a single-file `cat`/`head`), not when the task is read. | An implementation brief is drafted for a `.cs` change before any `.cs` file is opened: `dotnet-repository` is absent from the plan. | Agents read the target files before proposing a patch. None in the mechanism itself. |
| 2 | **Files never opened by a tool trigger nothing.** A file created or rewritten by a Bash command that is not a read (`sed -i`, a generator, `dotnet new`) does not load the rule. | Scaffolding through the CLI. | Read the generated file before editing it. |
| 3 | **No intent-based scoping.** `paths` matches files, not activities. ADR-006's "any git operation" trigger has no equivalent. | `git-conventions` and `branch-pr` load in every session, including ones that never touch git — the same cost as before, now explicit. | Keep them short. Moving them to Agent Skills (on-demand by `description`) is the option if their size grows. |
| 4 | **Glob false positives.** Patterns match layout, not stack: `src/services/**/*.ts` exists in a Node backend too. | `vue-service` loads in a non-Vue repo with that layout. | Patterns are tightened when a misfire is seen; `*.vue` stays the primary signal. |
| 5 | **Not shipped by the plugin.** A plugin carries skills, not rules (ADR-013). Plugin installs and cloud sessions — whose setup script runs `sync-claude.mjs`, not `onboarding.mjs` — get no conventions. | `/ai-dev-tools:pr-review` in a consuming repo, any claude.ai/code session. | Cloud setup script can add the link (`ln -s "$HOME/ai-dev-tools/rules" ~/.claude/rules/ai-dev-tools`). Not automated here. |
| 6 | **Cowork desktop sessions skip them.** Cowork ignores a symlinked `~/.claude/rules/` entry pointing outside the working directory. | Any Cowork desktop session. | None short of copying the files instead of linking them. |
| 7 | **Breaking migration.** The workspace `CLAUDE.md` deployed before this ADR imports `~/.claude/skills/*.md`, which no longer resolve. | Every machine onboarded before this ADR, until it re-runs onboarding. | Re-run `node scripts/onboarding.mjs`: it redeploys the workspace `CLAUDE.md`, removes the legacy link, creates the new one. |
| 8 | **Windows junction cleanup unverified.** The legacy-link check strips the `\\?\` prefix `readlinkSync` returns for junctions; not exercised on Windows. | Onboarding re-run on Windows. | If the legacy junction survives, it is dangling and harmless; delete `%USERPROFILE%\.claude\skills` by hand. |
| 9 | **Vocabulary change.** "Skill" disappears from this repo's primitives (ADR-002); notes, links or habits that say `skills/` go stale. | External docs, bookmarks to `skills/*.md`. | None; `tests/rules.test.mjs` prevents a flat `skills/` from reappearing. |

What is **not** lost: deterministic loading. Rules without `paths` load every session exactly as the imports did, and path-scoped rules load without relying on the model's judgement — the property that ruled out Agent Skills for `scope-guard`.

## Alternatives considered

- **Agent Skills (`skills/<name>/SKILL.md`)** — on-demand loading decided by the model from `description`: not guaranteed, wrong for `scope-guard`, which must always apply. Right fit later for procedures, not conventions.
- **Keep the imports, drop the conditional claim** — honest but keeps the context cost and the name clash.
