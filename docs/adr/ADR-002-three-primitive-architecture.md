# ADR-002 — Three-Primitive Architecture: Skills, Agents, Commands

**Status:** Accepted  
**Date:** 2026-05-23

## Context

Claude Code can be extended in many ways: custom instructions in `CLAUDE.md`, slash commands, subagent prompts, helper scripts. Without a clear taxonomy, these artefacts blur together, making the toolbox hard to reason about, extend, or maintain.

## Decision

All tooling is organised around three distinct primitives, each with a single responsibility:

| Primitive | Role | Invocation |
|---|---|---|
| **Skill** | Passive context — conventions, patterns, rules | Loaded automatically via `CLAUDE.md` |
| **Agent** | Execution unit — does one thing, explicit I/O | Called by commands |
| **Command** | Orchestrator — chains agents and scripts | Typed by the user (`/name`) |

**Rules:**
- Skills do not execute tasks; they shape reasoning
- Agents do not orchestrate; they transform one input into one output
- Commands do not contain logic; they define pipelines

## Consequences

**Positive**
- Each file is easy to categorise and locate (`skills/`, `agents/`, `commands/`)
- Agents are independently testable and reusable across commands
- New contributors understand the role of a file from its directory alone

**Negative**
- Strict separation requires discipline; the boundary between "logic" and "orchestration" needs to be enforced by convention (see CONTRIBUTING.md)
- Three concepts to learn before contributing

## Alternatives considered

- **Flat command-only model** — all logic inside slash commands; rejected because commands become monolithic and non-reusable
- **Single agent model** — one large "do everything" agent; rejected because it is not chainable and degrades with scope
