# ADR-001 — Human as Gate, Not Relay

**Status:** Accepted  
**Date:** 2026-05-23

## Context

AI-assisted development tools can be designed on a spectrum from fully autonomous (no human in the loop) to fully manual (human performs every step). The design choice significantly impacts trust, auditability, and the overall developer experience.

A fully autonomous approach (like `autonomous-dev-loop`) maximises throughput but removes the developer from decisions that require context, taste, or business judgement. A fully manual approach negates the value of automation.

## Decision

`ai-dev-tools` is designed so that the **human is a gate, not a relay**. Agents and commands automate every step they can, but the human explicitly approves transitions that carry risk or require context:

- **Merge gate** — no code reaches the main branch without human approval
- **Review gate** — `NEEDS_REVIEW` status halts the pipeline and surfaces the issue for human judgement
- **Invocation gate** — commands are typed by the user; nothing runs autonomously in the background

The interactive Claude Code CLI is the runtime; there is no headless scheduler or autonomous trigger.

## Consequences

**Positive**
- Developer stays aware of what is being changed and why
- Mistakes surface at a checkpoint before they compound
- Easier to trust and adopt incrementally

**Negative**
- Lower throughput than a fully autonomous pipeline
- Not suited for high-frequency, repetitive automation (use `autonomous-dev-loop` for that)

## Alternatives considered

- **Fully autonomous pipeline** — rejected for interactive use; extracted into the sister repo `autonomous-dev-loop`
- **Human as relay** (human copies output from one step to the next) — rejected as tedious and error-prone
