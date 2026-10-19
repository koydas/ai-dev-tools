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

**Negative**
- Rules load on file access, not on task intent: a rule reaches the context only after the first matching Read/Edit, not while planning.
- Machines onboarded before this ADR must re-run `onboarding.mjs` (the old workspace `CLAUDE.md` imports now-missing files).
- Cowork desktop sessions skip a symlinked rules directory pointing outside the working directory.

## Alternatives considered

- **Agent Skills (`skills/<name>/SKILL.md`)** — on-demand loading decided by the model from `description`: not guaranteed, wrong for `scope-guard`, which must always apply. Right fit later for procedures, not conventions.
- **Keep the imports, drop the conditional claim** — honest but keeps the context cost and the name clash.
