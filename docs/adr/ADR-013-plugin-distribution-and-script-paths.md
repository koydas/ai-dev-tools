# ADR-013 — Plugin Distribution and Plugin-Root Script Paths

**Status:** Accepted  
**Date:** 2026-10-14

## Context

Commands are meant to run inside *other* repositories (`/pr-review` on koydas/autonomous-dev-loop, `/issue-code-generation` on any project). They called their scripts as `node scripts/<name>.mjs`, a path relative to the session's working directory. Outside this repo that path does not exist — or, worse, names a different script: autonomous-dev-loop has its own `scripts/` directory. Every run started with the model searching for the toolbox, guessing `~/dev/ai-dev-tools`, or failing.

Agents had no YAML frontmatter, so Claude Code did not register them as subagents (`name` / `description` are what the Agent tool selects on), and commands had no `description` in the `/` menu.

Distribution was a copy (`sync-claude.mjs` → `~/.claude`) plus a skills symlink: per machine, manual, invisible to a repository that wants to declare "work with these tools".

## Decision

1. **Scripts are addressed from the plugin root.** Commands and agents write `node "${CLAUDE_PLUGIN_ROOT}/scripts/<name>.mjs"`. Claude Code substitutes `${CLAUDE_PLUGIN_ROOT}` in command and agent bodies of an installed plugin. `sync-claude.mjs` substitutes the same token with the absolute repo root (forward slashes) when it copies a `.md` file into `~/.claude`, so the copy mode keeps working. `tests/sync-claude.test.mjs` fails on any cwd-relative `node scripts/` or `"./scripts/` left in `commands/` or `agents/`.
2. **The repo is a plugin and its own marketplace.** `.claude-plugin/plugin.json` (plugin `ai-dev-tools`) and `.claude-plugin/marketplace.json` (marketplace `ai-dev-tools`, source `./`). A consuming repo declares it in its `.claude/settings.json`:
   ```json
   "extraKnownMarketplaces": { "ai-dev-tools": { "source": { "source": "github", "repo": "koydas/ai-dev-tools" } } },
   "enabledPlugins": { "ai-dev-tools@ai-dev-tools": true }
   ```
   Components are then namespaced (`/ai-dev-tools:pr-review`, agent `ai-dev-tools:pr-analyst`).
3. **Cloud sessions use the copy mode.** A cloud session does not install plugins declared by a repository. The cloud environment's setup script clones this repo and runs `sync-claude.mjs` (README, *Use from another repository*); the setup script runs before Claude Code starts, so the copied commands and agents are discovered.
4. **Every agent and command carries frontmatter** — agents `name` + `description`, commands `description` (+ `argument-hint`).

Skills stay flat Markdown imported by the workspace `CLAUDE.md` (ADR-006); the plugin does not ship them. *(Amended by [ADR-015](ADR-015-conventions-as-path-scoped-rules.md): they are now rules linked into `~/.claude/rules/`.)*

## Alternatives considered

- **Resolve the toolbox from an env var (`$AI_DEV_TOOLS_DIR`)** — works in every mode but needs per-machine setup and is not substituted by Claude Code; a missing variable runs `/scripts/x.mjs`.
- **Vendor the commands into each consuming repo's `.claude/`** — works in cloud sessions with no setup, but copies drift and every fix lands N times.
- **Plugin only, drop `sync-claude.mjs`** — simpler, but leaves cloud sessions with nothing.

## Consequences

- ✅ Commands run from any working directory; the cwd-relative path cannot come back unnoticed (test).
- ✅ A repo opts in with two settings keys; locally, trusting the folder offers the install.
- ✅ Agents are real subagents, selectable by the Agent tool.
- ⚠️ Plugin installs are a versioned copy (`version` in `plugin.json`): bump it to ship changes to plugin users.
- ⚠️ The copy mode bakes the absolute repo path into `~/.claude`: moving the clone needs a re-sync.
- ⚠️ A cloud environment snapshot keeps the toolbox version from its setup run until the environment is rebuilt.
