# ai-dev-tools

A Claude Code toolbox for AI-native development — commands, agents, skills, and scripts designed to compress the full SDLC cycle.
Built and maintained using the workflows it describes.

![WIP — being built in the open](https://img.shields.io/badge/status-WIP%20%E2%80%94%20being%20built%20in%20the%20open-yellow)
![Node ≥ 20](https://img.shields.io/badge/node-%E2%89%A520-lightgrey)
![Claude Code](https://img.shields.io/badge/Claude%20Code-required-blue)

---

## How it works

The goal is a development loop where the human is a **gate**, not a relay. Commands orchestrate agents; agents do one thing well; skills shape how they reason.

```
GitHub issue → /issue-code-generation → ticket-analyst → code-builder → code-reviewer → human merge gate
    input            command                 agent            agent           agent          approval
```

> See [`autonomous-dev-loop`](https://github.com/koydas/autonomous-dev-loop) for the fully automated version of this pattern — Issue → validator → coder → PR → reviewer → human merge gate, running on Qwen3-32B via Groq.

### Skills / Agents / Commands

| Primitive | Role | How it works |
|---|---|---|
| **Skills** | Passive context | Conventions, patterns, rules loaded automatically via `CLAUDE.md`. Shape *how* the agent reasons without being called explicitly. |
| **Agents** | Execution units | Discrete, specialized, explicit I/O contracts. Do one thing well. Chainable via structured `### Status / ### Handoff` blocks. |
| **Commands** | Orchestrators | Chain agents, invoke scripts, manage workflow state. Type `/name` in Claude Code to trigger a full pipeline. |

### Output contract (all agents)

Every agent produces a structured output block — this makes them chainable without human interpretation between steps:

```markdown
### Status
[DONE | BLOCKED | NEEDS_REVIEW] — one-line summary

### <Agent-specific section>
...findings, code, analysis...

### Handoff
Next step and what to pass forward
```

---

## Reference

### Commands

| Invoke | Agents used | What it does |
|---|---|---|
| `/issue-code-generation [id]` | `ticket-analyst` → `code-builder` → `code-reviewer` | Full issue → code → AC validation pipeline |
| `/pr-review` | `pr-analyst` | Review PR, write structured report to `~/dev/pr-reviews/` |
| `/pr-fixer` | `code-builder` | Apply blocking fixes from an existing review file |
| `/ac-check [id]` | `code-reviewer` | Validate code coverage against issue acceptance criteria |
| `/bug-seeker [id]` | — | Interactive investigation — issue, logs, code → diagnostic report |
| `/issue-notes [id]` | — | Generate technical overview, post as GitHub issue comment |
| `/demo-prep` | — | Feature description → slide-ready sprint demo content |
| `/token-audit [days]` | — | Audit Claude Code token usage — trends, model breakdown, command adoption |
| `/check-releases` | — | List repos with main changes not yet in a release |
| `/sync-ai-tools` | — | Sync commands and agents from this repo to `~/.claude` |

### Agents

| Agent | Input | Output |
|---|---|---|
| `ticket-analyst` | Raw GitHub issue | Concise implementation brief |
| `code-builder` | Implementation brief | Smallest correct patch |
| `code-reviewer` | Diff + context | Bugs, regressions, risks, missing tests |
| `pr-analyst` | PR diff | Structured review summary |
| `doc-builder` | Repo/branch context | Documentation |
| `impact-analyst` | Proposed change | Cross-repo blast radius analysis |

### Skills

| Skill | Loaded when | What it enforces |
|---|---|---|
| `scope-guard.md` | Always | Changes stay inside the authorized file perimeter |
| `wiki-first.md` | Always | Wiki/docs lookup before any business logic implementation |
| `git-conventions.md` | Any git op | Commit format, branching strategy, merge rules |
| `branch-pr.md` | Any git op | Branch, commit, and PR naming conventions |
| `dotnet-repository.md` | C# work | Repository/Handler/Controller patterns (Dapper) |
| `vue-ui.md` | Vue work | Component structure, store, i18n |
| `vue-service.md` | Vue work | Vuex service and store conventions |

> Skills are loaded by the global `CLAUDE.md` at workspace root, which acts as a navigation orchestrator — it routes to per-repo `CLAUDE.md` files and injects the relevant skills based on file paths being touched.

### Scripts

| Script | What it does |
|---|---|
| `onboarding.mjs` | Full setup — copy workspace config, create skills junction, deploy commands and agents |
| `sync-claude.mjs` | Incremental sync from `ai-dev-tools` → `~/.claude` (reports new/updated/extra) |
| `gh-get-issue.mjs` | Fetch GitHub issue by number → JSON |
| `gh-get-pr.mjs` | Fetch PR by number or source branch |
| `gh-get-pr-threads.mjs` | Fetch reviewer comment threads for a PR |
| `gh-post-comment.mjs` | Post a comment to a GitHub issue |
| `gh-my-issues.mjs` | List issues assigned to current user |
| `token-audit.mjs` | Aggregate token usage from Claude Code JSONL session files |
| `update-repos.mjs` | Pull latest on all configured repos |
| `list-files.mjs` | Recursive numbered file listing |

---

## Structure

```
ai-dev-tools/
├── agents/       Specialized subagents — explicit I/O contracts, chainable
├── commands/     Slash commands — type /name in Claude Code to invoke a pipeline
├── skills/       Stack conventions — loaded automatically via CLAUDE.md
├── scripts/      GitHub CLI, token auditing, sync utilities
├── prompts/      Standalone prompt templates for manual use
└── workspace/    Config files deployed to your dev root on setup
    ├── CLAUDE.md            Workspace orchestrator
    └── .claude/CLAUDE.md    Execution rules
```

---

## Setup

### Prerequisites

- Node ≥ 20
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- [GitHub CLI](https://cli.github.com/) authenticated
- Git

### Install

```bash
git clone https://github.com/koydas/ai-dev-tools ~/dev/ai-dev-tools
node ~/dev/ai-dev-tools/scripts/onboarding.mjs
```

Then open `.env` and set `gh_token` (scope: `repo, read:org`). The file is git-ignored.

### Sync after updates

```bash
node ~/dev/ai-dev-tools/scripts/sync-claude.mjs
```

> **Windows?** All scripts target PowerShell-compatible paths. The onboarding script creates a junction for `skills/` rather than a symlink.

---

## Extending

### Adding an agent

Create `agents/your-agent.md`. The file must define: a one-paragraph role description, an **Input** section listing what it expects, and an **Output** section specifying the `### Status / ### Handoff` contract. Run `/sync-ai-tools` to deploy.

### Adding a command

Create `commands/your-command.md`. Specify which agents it chains, in what order, and how state is passed between them. Commands invoke agents and scripts — they don't implement logic themselves.

---

## Related

| Repo | What it demonstrates |
|---|---|
| [`autonomous-dev-loop`](https://github.com/koydas/autonomous-dev-loop) | Fully autonomous GitHub-native SDLC — the pipeline this toolbox feeds into. Issue → validator → coder → PR → reviewer → human merge gate, running on Qwen3-32B via Groq. |
| [`fullstack-pilot`](https://github.com/koydas/fullstack-pilot) | Polyglot multi-service stack with GitOps, ADRs, Mermaid architecture diagrams, and AI agent integration. Staff/Architect positioning artifact. |
