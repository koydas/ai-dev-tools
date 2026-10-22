# ai-dev-tools

A Claude Code toolbox for AI-native development — commands, agents, rules, and scripts that compress the full SDLC into interactive, human-gated pipelines.

## Directory map

```
agents/     Specialized subagents — one responsibility, explicit I/O, chainable
commands/   Slash commands — pipeline definitions only, no logic
rules/      Stack conventions — Claude Code rules, path-scoped via `paths:` frontmatter
scripts/    External I/O — GitHub API, file ops (ESM .mjs, Node ≥ 20); mcp-server.mjs exposes them over MCP
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
| **Rules** | Passive context | Claude Code rules (`~/.claude/rules/`), loaded every session or on matching paths ([ADR-015](docs/adr/ADR-015-conventions-as-path-scoped-rules.md)). Encode conventions, not logic. |
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

### MCP tool

A script whose I/O should be callable from other MCP hosts gets an entry in `scripts/mcp-tools.mjs`: JSON Schema, annotations, pure `args()` validating the input (no value starting with `-`, free text through `stdin`). Read-only by default; a write tool needs `write: true` and a confirmation path ([ADR-016](docs/adr/ADR-016-mcp-server.md)). `tests/mcp-tools.test.mjs` checks the registry.

### Rule

Create `rules/your-rule.md` as a convention guide (Markdown only). Scope it with `paths:` frontmatter (glob list) when it only matters for some files; without it the rule loads every session. `paths` is the only frontmatter field Claude Code reads, and invalid YAML silently makes the rule unconditional — `tests/rules.test.mjs` checks both ([ADR-015](docs/adr/ADR-015-conventions-as-path-scoped-rules.md)). Add it to the table in `workspace/CLAUDE.md`.

Not to be confused with an Agent Skill (`<name>/SKILL.md` with `name` + `description`, loaded on demand by the model): this repo ships none.

### Script

Create `scripts/your-script.mjs` (ESM). Scripts own all external I/O — GitHub API calls, file system operations, token auditing. No external dependencies unless strictly necessary ([ADR-007](docs/adr/ADR-007-nodejs-scripts-for-io.md)).

## Configuration

| File | Contents | Versioned |
|---|---|---|
| `configs/git.yaml` | Non-secret git settings (`default_branch`, `remote`) | Yes |
| `configs/paths.yaml` | Output locations (`reports_dir`); `AI_DEV_TOOLS_REPORTS_DIR` overrides it | Yes |
| `.env` | Secrets (`gh_token`) | No — git-ignored |

Read `configs/git.yaml` via `scripts/config.mjs` (exported `loadGitConfig()`), `configs/paths.yaml` via `loadPathsConfig()`. Never put tokens or credentials in `configs/`.

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
- **Scripts — GraphQL fallback**: a script that uses GraphQL (incl. `gh pr view` / `gh repo view`) falls back to REST when it fails — pure, tested REST→shape mappers; a field REST cannot provide is `null` (unknown), never a default; output carries `source` ([ADR-011](docs/adr/ADR-011-graphql-rest-fallback.md), shared helpers in `scripts/gh-transport.mjs`)
- **Scripts — structure**: export the main functions AND provide a CLI entrypoint (`if process.argv[1] === fileURLToPath(import.meta.url)`)
- **Agents / Commands / Rules**: Markdown only — no code
- **Agents / Commands — frontmatter**: agents carry `name` + `description`, commands `description` (+ `argument-hint`); without it an agent is not a registered subagent
- **Agents / Commands — script paths**: always `node "${CLAUDE_PLUGIN_ROOT}/scripts/<name>.mjs"`, never `node scripts/…` — commands run from the consuming repo's working directory ([ADR-013](docs/adr/ADR-013-plugin-distribution-and-script-paths.md)); `tests/sync-claude.test.mjs` enforces it
- **Plugin version**: bump `version` in `.claude-plugin/plugin.json` when a change to `commands/`, `agents/` or `scripts/` must reach plugin installs
- **Commands delegate**: a command is a pipeline definition, never an implementation
- **Human gates**: invocation (user types the command), review (`NEEDS_REVIEW` status), merge (no autonomous push to main)

## Key references

| File | Purpose |
|---|---|
| `README.md` | Full reference — commands, agents, rules, scripts, setup |
| `CONTRIBUTING.md` | Architectural rules for adding agents and commands |
| `docs/adr/` | All architecture decisions with rationale |
| `docs/commands/` | Reference documentation for each slash command |
| `docs/mcp-server.md` | MCP server reference — setup, tools, prompts, resources, security model |

## Auto-sync

After creating or modifying any file in `agents/`, `commands/`, or `prompts/`, automatically run `/sync-ai-dev-tools` to deploy the changes to `~/.claude`. `rules/` is linked, not synced.
