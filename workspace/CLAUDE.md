# Workspace

This file is the workspace orchestrator for Claude Code. It routes to per-repo `CLAUDE.md` files; conventions load as rules (below).

---

## Rules

Conventions are Claude Code rules, linked at `~/.claude/rules/ai-dev-tools/` → `<ai-dev-tools>/rules/` by onboarding ([ADR-015](https://github.com/koydas/ai-dev-tools/blob/main/docs/adr/ADR-015-conventions-as-path-scoped-rules.md)). Claude Code loads them itself — no import here:

| Rule | Loaded |
|---|---|
| `scope-guard`, `wiki-first`, `git-conventions`, `branch-pr` | Every session |
| `dotnet-repository` | When a `*.cs`, `*.csproj` or `*.sln` file is read or edited |
| `vue-ui`, `vue-service` | When a `*.vue` file, or a `.ts`/`.js` file under `src/components`, `views`, `services` or `stores`, is read or edited |

---

## Repositories

Add an entry for each repo in your workspace:

```
# ~/dev/your-repo — per-repo context
```

---

## Notes

- Rules are symlinked at `~/.claude/rules/ai-dev-tools/` → `<ai-dev-tools>/rules/` — changes are live at the next session
- Commands and agents are deployed to `~/.claude/commands/` and `~/.claude/agents/` via `/sync-ai-dev-tools`
- The `scope-guard` and `wiki-first` rules are always active; apply them before writing any code
