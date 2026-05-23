# ai-dev-tools

A Claude Code toolbox for AI-native development — commands, agents, skills, and scripts that compress the full SDLC into interactive, human-gated pipelines.

## Directory map

```
agents/     Specialized subagents — one responsibility, explicit I/O, chainable
commands/   Slash commands — pipeline definitions only, no logic
skills/     Stack conventions — loaded automatically via CLAUDE.md routing
scripts/    External I/O — GitHub API, file ops (ESM .mjs, Node ≥ 20)
prompts/    Standalone prompt templates for manual use
workspace/  Config files deployed to developer root during onboarding
docs/adr/   Architecture Decision Records — source of truth for design decisions
```

## Architecture

Three primitives implement the **human as gate** model ([ADR-001](docs/adr/ADR-001-human-as-gate.md), [ADR-002](docs/adr/ADR-002-three-primitive-architecture.md)):

| Primitive | Role | Rule |
|---|---|---|
| **Skills** | Passive context | Loaded via `CLAUDE.md` routing. Encode conventions, not logic. |
| **Agents** | Execution units | One responsibility. Explicit Input / Output contract. Chainable. |
| **Commands** | Orchestrators | Chain agents and invoke scripts. Must not implement logic ([ADR-005](docs/adr/ADR-005-commands-delegate-logic.md)). |

## Agent output contract

Every agent must produce this structure ([ADR-003](docs/adr/ADR-003-structured-agent-output-contract.md)):

```markdown
### Status
[DONE | BLOCKED | NEEDS_REVIEW] — one-line summary

### <Agent-specific section>
...findings, code, analysis...

### Handoff
Next step and what to pass forward
```

`NEEDS_REVIEW` halts the pipeline and surfaces the issue for human judgement — do not continue past it automatically.

## Adding primitives

### Agent

Create `agents/your-agent.md` with:
- One-paragraph role description
- **Input** section — what it expects
- **Output** section — following the `### Status / ### Handoff` contract

### Command

Create `commands/your-command.md` with:
- Which agents it chains, in what order
- How state is passed between agents
- No logic in commands — delegate everything to agents or scripts

### Skill

Create `skills/your-skill.md` as a convention guide (Markdown only). Add a file-path routing rule to `workspace/CLAUDE.md` so the skill is injected when relevant files are touched ([ADR-006](docs/adr/ADR-006-claude-md-as-workspace-orchestrator.md)).

### Script

Create `scripts/your-script.mjs` (ESM). Scripts own all external I/O — GitHub API calls, file system operations, token auditing. No external dependencies unless strictly necessary ([ADR-007](docs/adr/ADR-007-nodejs-scripts-for-io.md)).

## Conventions

- **Scripts**: ESM `.mjs`, Node ≥ 20, minimal external dependencies
- **Agents / Commands / Skills**: Markdown only — no code
- **Commands delegate**: a command is a pipeline definition, never an implementation
- **Human gates**: invocation (user types the command), review (`NEEDS_REVIEW` status), merge (no autonomous push to main)

## Key references

| File | Purpose |
|---|---|
| `README.md` | Full reference — commands, agents, skills, scripts, setup |
| `CONTRIBUTING.md` | Architectural rules for adding agents and commands |
| `docs/adr/` | All architecture decisions with rationale |
