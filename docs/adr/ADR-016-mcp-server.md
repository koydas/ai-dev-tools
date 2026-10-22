# ADR-016 — The Toolbox as an MCP Server

**Status:** Accepted  
**Date:** 2026-10-21  
**Relates to:** ADR-007 (scripts own I/O), ADR-010 (MCP as *client* fallback), ADR-001 (human as gate)

## Context

The toolbox is usable from Claude Code only: commands and agents are Claude Code primitives, and the scripts are reached through its Bash tool. ADR-010 already uses MCP in the other direction — as a *client*, to reach GitHub when `gh` is unavailable. Other MCP hosts (Codex, Cursor, Claude Desktop, any agent runtime) cannot call the GitHub I/O scripts with their typed, validated contracts, nor read the pipelines.

## Decision

`scripts/mcp-server.mjs` is an MCP server over stdio (newline-delimited JSON-RPC 2.0, protocol versions 2025-06-18 / 2025-03-26 / 2024-11-05), zero dependency (ADR-007, CLAUDE.md conventions).

1. **Tools = scripts.** `scripts/mcp-tools.mjs` is a registry: per tool, a JSON Schema, annotations, and a pure `args(input)` that validates the input and builds the script's argv. The server runs `node scripts/<script>` with `spawn` (no shell) and returns stdout; a non-zero exit is a tool result with `isError: true` and stderr — a tool-execution error, not a protocol error. No logic is added or duplicated: the scripts stay the single implementation, and the CLI and MCP surfaces cannot drift.
   - Read-only: `get_issue`, `get_pr`, `get_pr_threads`, `get_pr_feedback`, `get_check_runs`, `my_issues`, `normalize_pr`.
   - Write: `post_comment` only.
2. **Input is validated before it reaches a script.** Unknown properties are rejected; `repo` must match `owner/repo`; `sha` is hex; free-text positionals (`ref`, `branch`) may not start with `-` (flag injection). The comment body and the PR object travel through **stdin**, never argv (the body is author-controlled text, as in ADR-012).
3. **Prompts = commands.** `commands/*.md` are listed as prompts (`sync-ai-dev-tools` excluded: it administers a Claude Code install). `prompts/get` returns the body with `${CLAUDE_PLUGIN_ROOT}` replaced by the repo root (the `sync-claude.mjs` substitution, ADR-013) and `$ARGUMENTS` by the single `arguments` prompt argument. A fixed preamble tells the host to read named subagents from resources.
4. **Resources = agents.** `agents/*.md` are exposed read-only as `ai-dev-tools://agents/<name>`. A host without subagents follows the agent file as instructions; the `### Status / ### Handoff` contract (ADR-003) is unchanged.
5. **Human gate on the write.** `post_comment` carries `readOnlyHint: false, destructiveHint: false`. When the client declares the `elicitation` capability, the server asks for confirmation (`elicitation/create`, showing repo, number and body) and posts only on `accept` with `confirm: true`; decline, cancel, dismissal or a vanished client mean not posted. When the client has no elicitation, the call runs and the client's own tool-approval prompt is the gate (MCP leaves that to the host). The tool posts a plain comment — never an approving or changes-requested review, never a merge (ADR-001, ADR-012).
6. **Not exposed:** `onboarding`, `sync-claude`, `update-repos`, `checkpoint`, `token-audit`, `list-files`, `check-releases`. They read or write the local machine (`~/.claude`, arbitrary paths, other clones), which a remote-callable tool must not do on a client's behalf; they remain CLI / command-only.
7. **Working directory.** Scripts that default to the current repository (`gh repo view`, origin remote) resolve it from the server's cwd, which the host chooses. Callers should pass `repo`.

## Alternatives considered

- **Official SDK (`@modelcontextprotocol/sdk`)** — handles transports and schema validation, but breaks the zero-dependency rule for the sake of ~150 lines of stdio JSON-RPC over six methods. Revisit if streamable HTTP or auth is needed.
- **Import the scripts' functions in-process** — faster, but the scripts' exports are not uniform (some are CLI-only), and it would couple the server to each script's internals; a subprocess keeps the CLI the contract.
- **Bundle the server in the plugin (`.mcp.json`)** — in Claude Code the same scripts are already reached through commands; the server would only duplicate tools. Left out; other hosts register it by hand (README).
- **Make `post_comment` fail closed without elicitation** — safest, but unusable in hosts that gate tool calls themselves (most of them). The annotation plus host approval is the MCP-defined contract.

## Consequences

**Positive**
- Any MCP host gets typed, validated GitHub I/O and the pipelines, with no Claude Code dependency.
- One implementation per behaviour; tests cover the registry (`tests/mcp-tools.test.mjs`) and the protocol end to end over a real stdio process (`tests/mcp-server.test.mjs`).

**Negative**
- Prompts reference subagents and Bash that a host may lack; the preamble bridges this but the degradation is the host's. Commands' `gh` preflight and MCP fallback (ADR-010) still apply inside them.
- A hand-written protocol layer to keep in step with the spec (no `listChanged`, subscriptions, pagination, `outputSchema`, cancellation or progress).
- Tool results are the scripts' JSON as text, not `structuredContent`.
- `gh` must be installed and authenticated where the server runs.
