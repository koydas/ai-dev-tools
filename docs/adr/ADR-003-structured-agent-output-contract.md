# ADR-003 — Structured Agent Output Contract

**Status:** Accepted  
**Date:** 2026-05-23

## Context

When multiple agents are chained in a pipeline (`ticket-analyst` → `code-builder` → `code-reviewer`), each agent's output becomes the next agent's input. Without a predictable output format, the orchestrating command must interpret free-form text — which is fragile, model-dependent, and breaks silently.

## Decision

Every agent produces a structured Markdown output block with mandatory sections:

```markdown
### Status
[DONE | BLOCKED | NEEDS_REVIEW] — one-line summary

### <Agent-specific section>
...findings, code, analysis...

### Handoff
Next step and what to pass forward
```

- **`### Status`** — machine-readable signal that commands use to decide whether to continue or halt
- **`### Handoff`** — human-readable instruction describing what the next step should receive
- **Agent-specific section** — unconstrained content scoped to the agent's domain

The three status values are exhaustive:
- `DONE` — output is complete, pipeline may continue
- `BLOCKED` — agent cannot proceed; human intervention required
- `NEEDS_REVIEW` — output exists but has a concern that must be reviewed before proceeding

## Consequences

**Positive**
- Commands can branch on `Status` without parsing prose
- Pipelines halt gracefully instead of silently propagating bad state
- Outputs are readable as standalone documents in `~/dev/pr-reviews/`

**Negative**
- Agents must be authored to produce this format; free-form agents are not first-class citizens
- The contract is enforced by prompt convention, not by a schema validator

## Alternatives considered

- **JSON output** — more machine-readable but harder to read by humans and harder to author in prompts
- **No standard format** — rejected; makes chaining unreliable
