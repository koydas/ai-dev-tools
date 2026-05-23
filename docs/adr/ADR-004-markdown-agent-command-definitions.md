# ADR-004 — Agents and Commands Defined as Markdown Files

**Status:** Accepted  
**Date:** 2026-05-23

## Context

Agents and commands need to encode instructions for the Claude model. These instructions can be stored in many forms: code (Python, JS), configuration (YAML/JSON), or natural language documents (Markdown).

The instructions are ultimately prompt content consumed by a language model, not machine-executable logic.

## Decision

Agents and commands are defined as **Markdown files** in `agents/` and `commands/` directories respectively.

- Agents are `.md` files with a role paragraph, an `Input` section, and an `Output` section
- Commands are `.md` files that specify the agent chain, state-passing strategy, and invocation syntax
- Claude Code's slash command mechanism maps filenames to `/command-name` invocations natively

## Consequences

**Positive**
- Directly readable and editable without a development environment
- Diffs are meaningful in code review (changes to instructions are visible as text changes)
- No build step required; edits are live after `/sync-ai-dev-tools`
- Claude Code's native file-based command loading requires no additional tooling

**Negative**
- No static type-checking or schema validation on the instruction content
- Markdown structure is enforced by convention, not syntax
- Prompt quality depends on human authorship discipline

## Alternatives considered

- **YAML configuration files** — more structured but less expressive for multi-paragraph instructions
- **Code files with string prompts** — adds unnecessary indirection; harder to read and diff
