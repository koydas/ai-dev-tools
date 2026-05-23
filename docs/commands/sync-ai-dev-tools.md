# /sync-ai-dev-tools

Incremental sync from the `ai-dev-tools` repo to `~/.claude`.

## Purpose

Keeps your local Claude Code installation up to date with the latest commands, agents, and prompt templates from this repo. Run this after pulling changes or after creating or modifying any file in `commands/`, `agents/`, or `prompts/`.

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
| `prompts/` | `~/.claude/prompts/` | Standalone prompt templates |

Source directories that do not yet exist are skipped silently.

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

## Skills — not synced here

Skills (files in `skills/`) are not copied by this script. During initial setup, `onboarding.mjs` creates a junction/symlink so that `~/.claude/skills/` points directly to `ai-dev-tools/skills/`. Changes to skills are therefore available immediately without a sync step.

## See also

- [`scripts/sync-claude.mjs`](../../scripts/sync-claude.mjs) — the script this command delegates to
- [`scripts/onboarding.mjs`](../../scripts/onboarding.mjs) — full setup including skills junction
