# ADR-018 — Consumer Repository Adoption: Plugin Declaration and Per-Repo Skills

**Status:** Accepted  
**Date:** 2026-10-22

## Context

[ADR-013](ADR-013-plugin-distribution-and-script-paths.md) makes the toolbox installable as a plugin, but leaves open how a repository adopts it and where that repository's own knowledge lives. In practice only `autonomous-dev-loop` declared the plugin; `sync-engine`, `fullstack-pilot`, `agent-patterns` and `koydas` had no `.claude/` at all, so a session there got neither the commands nor any on-demand procedure. Repo-specific procedures (add an ADR, validate a change, add a pattern) were either restated in always-loaded files or absent.

## Decision

1. **Every repository worked on with Claude Code declares the plugin** in `.claude/settings.json` (`extraKnownMarketplaces` + `enabledPlugins`, exactly the two keys of ADR-013 §2). The file is identical across repos.
2. **Three layers, narrowest wins on conflict:**

   | Layer | Lives in | Loaded | Holds |
   |---|---|---|---|
   | Toolbox | the plugin (`commands/`, `agents/`) | on invocation | generic pipelines; no repo knowledge |
   | Repo rules | `CLAUDE.md` / `AGENTS.md` | every session | invariants, conventions, pointers |
   | Repo skills | `.claude/skills/<name>/SKILL.md` | on demand, by `description` | multi-step procedures for that repo |

   The toolbox discovers a repo's checks from its `CLAUDE.md` / `AGENTS.md` and `.github/workflows/`; it never carries them.
3. **Skills belong to the consuming repo, never to the plugin.** The plugin ships none (ADR-013). A skill carries `name` + `description` (the description is the trigger), holds a procedure, and links to rules instead of restating them. An invariant stays in `CLAUDE.md`; a procedure goes in a skill.
4. **Cloud sessions keep the environment-level setup script** (ADR-013 §3): a repository cannot install a plugin there. In a session with several repositories, hooks and permissions of the repositories are not read; `CLAUDE.md` and skills are.
5. **Each consumer documents its adoption** in `docs/claude-code.md` (what it enables, which skills exist and why). Where the repo keeps ADRs, it records the decision there too, linking here. The canonical description is [`docs/consumer-repos.md`](../consumer-repos.md).

## Alternatives considered

- **Ship repo skills inside the plugin** — one place to maintain, but the plugin then encodes five repos' conventions and every repo change needs a plugin release.
- **Put the skills in `~/.claude/skills`** — per machine, invisible to cloud sessions and to anyone cloning the repo.
- **Vendor commands into each repo** — rejected in ADR-013 (drift).
- **Declare the plugin in `autonomous-dev-loop` only** — status quo; the other four repos got no toolbox.

## Consequences

- ✅ Opening any of the repos gives the same toolbox and that repo's own procedures, with no per-machine step beyond trusting the folder.
- ✅ Conventions are changed in the repo that owns them, reviewed with the code they govern.
- ⚠️ Cloud sessions still need the environment setup script; a repo-level file cannot replace it.
- ⚠️ `sync-claude.mjs` copies `commands/`, `agents/`, `prompts/` only; `rules/` are not available in cloud sessions (ADR-015 links them locally). Open point.
- ⚠️ The identical `settings.json` is duplicated per repo; a change to the declaration lands N times (two keys, accepted).
