# ai-dev-tools

A Claude Code toolbox for AI-native development — commands, agents, skills, and scripts that compress the full SDLC into interactive, human-gated pipelines.

## Directory map

```
agents/     Specialized subagents — one responsibility, explicit I/O, chainable
commands/   Slash commands — pipeline definitions only, no logic
skills/     Stack conventions — loaded automatically via CLAUDE.md routing
scripts/    External I/O — GitHub API, file ops (ESM .mjs, Node ≥ 20)
configs/    Versioned non-secret configuration (git.yaml, …)
prompts/    Standalone prompt templates for manual use
tests/      Node unit tests (node --test), zero external dependencies
workspace/  Config files deployed to developer root during onboarding
docs/adr/      Architecture Decision Records — source of truth for design decisions
docs/commands/ Reference documentation for each slash command
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

Also create `docs/commands/your-command.md` with purpose, invocation, and output format.

### Skill

Create `skills/your-skill.md` as a convention guide (Markdown only). Add a file-path routing rule to `workspace/CLAUDE.md` so the skill is injected when relevant files are touched ([ADR-006](docs/adr/ADR-006-claude-md-as-workspace-orchestrator.md)).

### Script

Create `scripts/your-script.mjs` (ESM). Scripts own all external I/O — GitHub API calls, file system operations, token auditing. No external dependencies unless strictly necessary ([ADR-007](docs/adr/ADR-007-nodejs-scripts-for-io.md)).

## Configuration

| File | Contents | Versioned |
|---|---|---|
| `configs/git.yaml` | Non-secret git settings (`default_branch`, `remote`) | Yes |
| `.env` | Secrets (`gh_token`) | No — git-ignored |

Read `configs/git.yaml` via `scripts/config.mjs` (exported `loadGitConfig()`). Never put tokens or credentials in `configs/`.

## Tests

Scripts in `scripts/` are tested in `tests/` using the native Node test runner:

```bash
node --test
```

- Zero external dependencies in tests
- Scripts that shell out to the `gh` CLI are not unit-tested — they require an authenticated `gh` (integration tests)
- Add `tests/<script>.test.mjs` for each new script whose logic is testable without an external CLI

## Conventions

- **Scripts**: ESM `.mjs`, Node ≥ 20, minimal external dependencies
- **Scripts — security**: use `execFileSync(cmd, argsArray)` — never `execSync` with user-controlled string interpolation (shell injection)
- **Scripts — CLI detection**: use `fileURLToPath(import.meta.url)` to compare against `process.argv[1]` (Windows-compatible)
- **Scripts — portability**: no Unix utilities (`tail`, `head`, `grep`) — use native git options or plain JS
- **Scripts — GitHub API**: always pass `--paginate` to `gh api` to avoid silently losing data past the first page
- **Scripts — structure**: export the main functions AND provide a CLI entrypoint (`if process.argv[1] === fileURLToPath(import.meta.url)`)
- **Agents / Commands / Skills**: Markdown only — no code
- **Commands delegate**: a command is a pipeline definition, never an implementation
- **Human gates**: invocation (user types the command), review (`NEEDS_REVIEW` status), merge (no autonomous push to main)

## Key references

| File | Purpose |
|---|---|
| `README.md` | Full reference — commands, agents, skills, scripts, setup |
| `CONTRIBUTING.md` | Architectural rules for adding agents and commands |
| `docs/adr/` | All architecture decisions with rationale |
| `docs/commands/` | Reference documentation for each slash command |

## Auto-sync

After creating or modifying any file in `agents/`, `commands/`, `skills/`, or `prompts/`, automatically run `/sync-ai-dev-tools` to deploy the changes to `~/.claude`.
