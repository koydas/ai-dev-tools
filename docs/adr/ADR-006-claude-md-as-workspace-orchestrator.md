# ADR-006 — CLAUDE.md as Workspace Orchestrator and Skill Router

**Status:** Accepted  
**Date:** 2026-05-23

## Context

Skills encode stack-specific conventions (e.g. `.NET` repository patterns, Vue component structure). Loading all skills for every task would pollute context and introduce irrelevant rules. Skills need to be injected selectively based on what the agent is working on.

Claude Code's `CLAUDE.md` file is loaded automatically and can contain instructions that shape agent behaviour globally.

## Decision

The workspace-root `CLAUDE.md` acts as a **navigation orchestrator**:

1. It routes to per-repository `CLAUDE.md` files when the agent is working inside a specific repo
2. It injects skills conditionally based on the **file paths being touched** (e.g. `*.cs` files trigger `dotnet-repository.md`; `*.vue` files trigger `vue-ui.md` and `vue-service.md`)
3. It loads cross-cutting skills unconditionally (e.g. `scope-guard.md`, `git-conventions.md`)

Skills are stored in `skills/` and symlinked (or junctioned on Windows) into `~/.claude/` during onboarding, making them available to the workspace `CLAUDE.md`.

## Consequences

**Positive**
- Agents only receive conventions relevant to the current task
- Adding a new technology stack requires only a new skill file and a routing rule in `CLAUDE.md`
- Skills remain decoupled from commands and agents

**Negative**
- File-path-based routing is heuristic; it may misfire if conventions are inconsistently applied
- The workspace `CLAUDE.md` becomes a critical dependency; misconfiguration silently disables skills

## Alternatives considered

- **Load all skills always** — simpler routing but bloated context; irrelevant rules may conflict
- **Explicit skill invocation in commands** — more precise but verbose; requires every command to declare its skill dependencies
