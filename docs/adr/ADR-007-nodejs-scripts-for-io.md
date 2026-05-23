# ADR-007 — Node.js (ESM) Scripts for External I/O

**Status:** Accepted  
**Date:** 2026-05-23

## Context

Commands need to fetch data from external systems (GitHub API, local JSONL session files) and perform file I/O. This logic cannot reliably live in a language model prompt — deterministic data retrieval requires deterministic code.

A scripting runtime must be chosen. The candidates are: shell (bash/zsh/PowerShell), Python, and Node.js.

## Decision

All external I/O is handled by **Node.js scripts using ESM (`.mjs`)** in the `scripts/` directory.

Key scripts:
- `gh-get-issue.mjs`, `gh-get-pr.mjs`, `gh-get-pr-threads.mjs` — GitHub data fetching
- `gh-post-comment.mjs` — GitHub write operations
- `token-audit.mjs` — JSONL session file aggregation
- `onboarding.mjs`, `sync-claude.mjs` — workspace setup and sync

Scripts are designed to run both from the CLI and from within commands via Claude Code's tool execution.

## Consequences

**Positive**
- Node ≥ 20 is a prerequisite already required by the project; no additional runtime dependency
- ESM modules are portable across macOS, Linux, and Windows (PowerShell-compatible paths)
- Scripts can be called directly from the terminal for debugging without invoking Claude Code
- Structured JSON output from scripts is easy for agents to consume

**Negative**
- Node.js is heavier than shell scripts for simple operations
- Developers unfamiliar with Node.js need to context-switch when modifying scripts

## Alternatives considered

- **Shell scripts** — not cross-platform (bash vs PowerShell); rejected for Windows compatibility
- **Python scripts** — viable but adds a second runtime; Node.js was already required
- **Inline tool calls in agents** — non-deterministic; the LLM may hallucinate API responses or misformat parameters
