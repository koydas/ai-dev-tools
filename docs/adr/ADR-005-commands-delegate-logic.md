# ADR-005 — Commands Delegate Logic to Agents and Scripts

**Status:** Accepted  
**Date:** 2026-05-23

## Context

Slash commands are the user-facing entry points of the toolbox. There is a temptation to embed logic (API calls, data transformation, business rules) directly in command files because they are the visible artefact.

Embedding logic in commands creates monolithic files that are hard to reuse and test independently.

## Decision

Commands contain **pipeline definitions only** — no logic. All logic is delegated:

- **Reasoning / analysis / generation** → agents
- **Data fetching, I/O, file operations** → Node.js scripts in `scripts/`

A command file specifies:
1. Which agents to invoke, and in what order
2. How to pass state between them (what to forward from one agent's output to the next's input)
3. Which script to call to fetch external data (e.g. `gh-get-issue.mjs`)

This rule is documented in `CONTRIBUTING.md` as an architectural invariant.

## Consequences

**Positive**
- Agents and scripts are independently reusable (e.g. `code-builder` is shared by `/issue-code-generation` and `/pr-fixer`)
- Command files remain short and scannable
- Easier to test agents in isolation

**Negative**
- Strict discipline required; no automated enforcement prevents logic from creeping into commands
- Developers new to the project need to internalise the distinction before contributing

## Alternatives considered

- **Self-contained commands** — each command implements its own logic; rejected due to duplication and monolithic growth
- **Agent-only model without scripts** — agents would need to perform I/O; rejected because mixing reasoning and I/O in a prompt reduces reliability
