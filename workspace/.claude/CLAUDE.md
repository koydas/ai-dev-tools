# Claude Code — global execution rules

These rules apply to every Claude Code session regardless of repository.

---

## Core principles

1. **Human as gate** — never commit, push, or post to external services without explicit human confirmation
2. **Scope discipline** — read `scope-guard.md` before modifying any file; stay within the authorized perimeter
3. **Docs before code** — read `wiki-first.md` before implementing business logic; check ADRs and wikis first
4. **Structured output** — all agent outputs follow the `### Status / ### Handoff` contract; `NEEDS_REVIEW` halts pipelines

## Autonomous actions — never do without confirmation

- `git push`, `git commit` (except when explicitly asked)
- Opening, closing, or commenting on GitHub issues or PRs
- Sending messages (Slack, email, webhooks)
- Deleting files, branches, or database records
- Modifying CI/CD pipelines or infrastructure config

## Safe autonomous actions

- Reading files, running read-only `git` commands (`status`, `log`, `diff`)
- Running tests and linters
- Creating new files within the authorized scope
- Running scripts that only read and output (no external I/O)

## Commands

All slash commands are available in `~/.claude/commands/`. Type `/command-name` to invoke a pipeline.

Key commands: `/issue-code-generation`, `/pr-review`, `/pr-fixer`, `/ac-check`, `/bug-seeker`, `/issue-notes`, `/token-audit`, `/check-releases`, `/sync-ai-dev-tools`

## Agents

All agent definitions are in `~/.claude/agents/`. Agents are invoked by commands — do not call them directly unless debugging a pipeline step.

Available agents: `ticket-analyst`, `code-builder`, `code-reviewer`, `pr-analyst`, `doc-builder`, `impact-analyst`
