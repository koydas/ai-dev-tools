# /sync-ai-dev-tools

Incremental sync from the `ai-dev-tools` repo to `~/.claude`.

## Purpose

Keeps your local Claude Code installation up to date with the latest commands and agents from this repo. Run this after pulling changes or after creating or modifying any file in `commands/` or `agents/`.

## Invocation

In Claude Code:

```
/sync-ai-dev-tools
```

From the terminal:

```bash
node ~/dev/ai-dev-tools/scripts/sync-claude.mjs
```

## What it syncs

| Directory | Destination | Notes |
|---|---|---|
| `commands/` | `~/.claude/commands/` | Slash commands available in all Claude Code sessions |
| `agents/` | `~/.claude/agents/` | Subagent prompt files |

Source directories that do not yet exist are skipped silently.

In `.md` files, `${CLAUDE_PLUGIN_ROOT}` is replaced by the absolute path of the source repo (forward slashes), so commands and agents find their scripts from any working directory ([ADR-013](../adr/ADR-013-plugin-distribution-and-script-paths.md)). A file is reported `updated` when its substituted content differs from the target.

## Output format

Each file processed is reported on a single line:

```
  [new]     commands/sync-ai-dev-tools.md
  [updated] agents/code-builder.md
  [extra]   commands/my-local-command.md
```

| Label | Meaning |
|---|---|
| `new` | File exists in source, did not exist in target — copied |
| `updated` | File exists in both, content differs — target overwritten |
| `extra` | File exists in target but not in source — **not deleted**, logged only |

A per-directory summary and a grand total are printed at the end.

## Rules — not synced here

Rules (files in `rules/`) are not copied by this script. During initial setup, `onboarding.mjs` creates a junction/symlink so that `~/.claude/rules/ai-dev-tools/` points directly to `ai-dev-tools/rules/` (ADR-015). Changes to rules are therefore picked up at the next session without a sync step.

## See also

- [`scripts/sync-claude.mjs`](../../scripts/sync-claude.mjs) — the script this command delegates to
- [`scripts/onboarding.mjs`](../../scripts/onboarding.mjs) — full setup including the rules link
