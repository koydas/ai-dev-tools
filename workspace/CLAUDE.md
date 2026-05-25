# Workspace

This file is the workspace orchestrator for Claude Code. It routes to per-repo `CLAUDE.md` files and injects the relevant skills based on which files are being touched.

---

## Skill routing

The following skills are active based on the current task context. Load the relevant skill file(s) before reasoning about conventions, patterns, or implementation:

### Always active

@~/.claude/skills/scope-guard.md
@~/.claude/skills/wiki-first.md

### Git operations (commits, branches, PRs, merges)

@~/.claude/skills/git-conventions.md
@~/.claude/skills/branch-pr.md

### C# / .NET files (`*.cs`, `*.csproj`, `*.sln`)

@~/.claude/skills/dotnet-repository.md

### Vue files (`*.vue`, `components/`, `views/`, `stores/`, `services/`)

@~/.claude/skills/vue-ui.md
@~/.claude/skills/vue-service.md

---

## Repositories

Add an entry for each repo in your workspace:

```
# ~/dev/your-repo — per-repo context
```

---

## Notes

- Skills are symlinked at `~/.claude/skills/` → `<ai-dev-tools>/skills/` — changes are live immediately
- Commands and agents are deployed to `~/.claude/commands/` and `~/.claude/agents/` via `/sync-ai-dev-tools`
- The `scope-guard` and `wiki-first` skills are always active; apply them before writing any code
