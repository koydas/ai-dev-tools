# ai-dev-tools

A production-grade Claude Code toolbox for AI-native development workflows — commands, agents, skills, prompts, and scripts designed to compress the full SDLC cycle.

Built and maintained using the workflows it describes.

---

## Project status

This README is the first project artifact and serves as the blueprint for the repository. The directories, commands, agents, skills, prompts, and scripts described below are intended to be added incrementally through dedicated issues.

---

## What this repo demonstrates

- **Slash commands** that orchestrate multi-step workflows from a single invocation
- **Specialized subagents** with explicit input/output contracts, chainable across pipelines
- **Stack conventions (skills)** loaded automatically to give the agent persistent domain context
- **GitHub CLI integration** — ticket fetch, PR operations, comment posting, all scriptable
- **Onboarding automation** — clone, configure, and sync a new machine in one script

---

## Structure

```
ai-dev-tools/
├── agents/       Specialized subagents — discrete units with defined I/O contracts
├── commands/     Slash commands — type /name in Claude Code to run them
├── prompts/      Prompt templates — copy/paste or pass directly to an agent
├── scripts/      Node.js utility scripts (GitHub CLI, token auditing, etc.)
├── skills/       Stack conventions — loaded automatically by the agent
└── workspace/    Config files to copy to your dev root during setup
    ├── CLAUDE.md           Claude Code workspace instructions
    └── .claude/
        └── CLAUDE.md       Claude Code execution rules
```

---

## Getting Started

### Prerequisites

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed
- [GitHub CLI](https://cli.github.com/) (`gh`) available in your PATH and authenticated
- Git available in your PATH

### 1. Clone this repo

```bash
git clone https://github.com/koydas/ai-dev-tools ~/dev/ai-dev-tools
cd ~/dev/ai-dev-tools
```

### 2. Run the setup script

```bash
node scripts/onboarding.mjs
```

This copies workspace config, sets up the skills junction, and deploys commands, agents, and scripts to their target locations.

### 3. Fill in your credentials

The script creates `.env` from the template. Open it and fill in your keys:

```env
gh_token=<GitHub PAT — scope: repo, read:org>
```

> `.env` is git-ignored and never committed.

---

## Keeping your environment in sync

After pulling changes, run the sync script:

```bash
node ~/dev/tools/sync-claude.mjs
```

The script:

- Copies new and updated files from `commands/` and `agents/` to `~/.claude/`
- Verifies the `skills/` junction is intact
- Reports what was copied, updated, already up-to-date, or extra

> **New machine?** Use `scripts/onboarding.mjs` instead — it covers the full setup.

---

## Reference

### Agents

| File | What it does |
|---|---|
| `code-builder.md` | Implements a change with the smallest correct patch |
| `code-reviewer.md` | Reviews code — bugs, regressions, risks, missing tests |
| `ticket-analyst.md` | Turns a raw issue into a concise implementation brief |

### Commands

| File | Type in Claude Code | What it does |
|---|---|---|
| `pr-review.md` | `/pr-review` | Records PR review comments and writes a review file to `~/dev/pr-reviews/` |
| `pr-fixer.md` | `/pr-fixer` | Applies blocking fixes from an existing PR review file |
| `issue-code-generation.md` | `/issue-code-generation [id]` | Generates code for an issue via `code-builder`, then validates AC coverage via `code-reviewer` |
| `bug-seeker.md` | `/bug-seeker [id]` | Interactive bug investigation — issue, logs, code, diagnostic report saved to `~/dev/bug-reports/` |
| `token-audit.md` | `/token-audit [days]` | Audit Claude Code token consumption — weekly trend, model breakdown, command adoption |

### Prompts

| File | What it does |
|---|---|
| `ticket-prompt.md` | Full workflow to implement an issue |
| `pr-prompt.md` | Full workflow to review a PR |

### Skills

| File | What it does |
|---|---|
| `branch-pr.md` | Branch, commit, and PR naming conventions |
| `wiki-first.md` | Forces a wiki/docs lookup before implementing any business logic |
| `scope-guard.md` | Keeps changes inside the authorized file perimeter before any modification |

### Scripts

| File | What it does |
|---|---|
| `onboarding.mjs` | Sets up the workspace — copies config, sets up junctions |
| `sync-claude.mjs` | Syncs commands and agents from ai-dev-tools to the local Claude Code environment |
| `gh-get-issue.mjs` | Fetches a GitHub issue by number and outputs its fields as JSON |
| `token-audit.mjs` | Aggregates token usage from Claude Code JSONL session files |

---

## Design Philosophy

### Commands vs Agents vs Skills

- **Skills** are passive context — conventions, patterns, rules the agent loads automatically before acting. They shape *how* the agent works.
- **Agents** are active execution units — discrete, specialized, with explicit input/output contracts. They do *one thing well*.
- **Commands** are orchestrators — they chain agents, call scripts, and manage state across a workflow. They are the entry point.

### Output contracts

Every agent produces a structured output block:

```markdown
### Status
[DONE | BLOCKED | NEEDS_REVIEW] — one-line summary

### <Agent-specific section>
...findings, code, analysis...

### Handoff
Next step and what to pass to it
```

This makes agents chainable without human interpretation between steps.

### Why this structure

The goal is a development loop where the human is a **gate**, not a **relay**. The agent handles investigation, drafting, and validation. The human approves or redirects.

> See [`autonomous-dev-loop`](https://github.com/koydas/autonomous-dev-loop) for the fully automated version of this pattern — Issue → PR → Review → Auto-Fix → human merge gate.

---

## Related repos

| Repo | What it demonstrates |
|---|---|
| [`autonomous-dev-loop`](https://github.com/koydas/autonomous-dev-loop) | Fully autonomous GitHub-native SDLC — the pipeline this toolbox feeds into |
| [`fullstack-pilot`](https://github.com/koydas/fullstack-pilot) | Polyglot multi-service stack with GitOps, ADRs, and AI agent integration |
