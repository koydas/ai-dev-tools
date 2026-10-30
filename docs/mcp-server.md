# MCP server

`scripts/mcp-server.mjs` exposes the toolbox to any [Model Context Protocol](https://modelcontextprotocol.io) host (Claude Code, Claude Desktop, Codex, Cursor, …): the GitHub scripts as typed **tools**, the slash commands as **prompts**, the agents as **resources**. Design rationale and rejected alternatives: [ADR-016](adr/ADR-016-mcp-server.md).

- Transport: stdio, newline-delimited JSON-RPC 2.0. Protocol versions `2025-06-18`, `2025-03-26`, `2024-11-05`.
- Zero dependency, Node ≥ 20.
- No logic of its own: each tool runs the matching script of `scripts/` as a child process (no shell) and returns its stdout.

## Requirements

| | |
|---|---|
| Node ≥ 20 | runs the server and the scripts |
| `gh` CLI, authenticated | every tool except `normalize_pr` calls GitHub through it (GraphQL, else REST — [ADR-011](adr/ADR-011-graphql-rest-fallback.md)) |
| A clone of this repo | the server reads `commands/` and `agents/` from the clone it is started from |

```bash
git clone https://github.com/koydas/ai-dev-tools ~/dev/ai-dev-tools
gh auth status
```

## Register the server

Always use an **absolute** path: the host starts the server from its own working directory.

**Claude Code**

```bash
claude mcp add ai-dev-tools -- node /abs/path/to/ai-dev-tools/scripts/mcp-server.mjs
```

**Any host that takes an `mcpServers` JSON block** (Claude Desktop `claude_desktop_config.json`, Cursor `.cursor/mcp.json`, …)

```json
{
  "mcpServers": {
    "ai-dev-tools": {
      "command": "node",
      "args": ["/abs/path/to/ai-dev-tools/scripts/mcp-server.mjs"]
    }
  }
}
```

**Codex** (`~/.codex/config.toml`)

```toml
[mcp_servers.ai-dev-tools]
command = "node"
args = ["/abs/path/to/ai-dev-tools/scripts/mcp-server.mjs"]
```

Config locations and field names are the host's; check its documentation if one of the snippets above is rejected.

## Check that it works

Without a host, from a shell:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node /abs/path/to/ai-dev-tools/scripts/mcp-server.mjs
```

Two JSON lines come back: the `initialize` result (`serverInfo.name` is `ai-dev-tools`) and the eight tools. With the [MCP Inspector](https://github.com/modelcontextprotocol/inspector): `npx @modelcontextprotocol/inspector node /abs/path/to/ai-dev-tools/scripts/mcp-server.mjs`.

In Claude Code, `/mcp` lists the server and its status.

## Tools

Every tool takes a JSON object; unknown properties are rejected. `repo` is always `owner/repo`; without it, the script resolves the repository from the server's working directory (the `origin` remote), which the host chooses — **pass `repo`**.

| Tool | Arguments | Script | Mode |
|---|---|---|---|
| `get_issue` | `number`, `repo?` | `gh-get-issue.mjs` | read |
| `get_pr` | `ref` **or** `branch` (exactly one), `repo?` | `gh-get-pr.mjs` | read |
| `get_pr_threads` | `number`, `repo?` | `gh-get-pr-threads.mjs` | read |
| `get_pr_feedback` | `number`, `repo?` | `gh-get-pr-feedback.mjs` | read |
| `get_check_runs` | `sha` (7–40 hex), `repo?` | `gh-get-check-runs.mjs` | read |
| `my_issues` | `repo?`, `state?` (`open`\|`closed`\|`all`), `limit?` (1–200) | `gh-my-issues.mjs` | read |
| `normalize_pr` | `pr` (raw PR object) | `normalize-pr.mjs` | read, no network |
| `post_comment` | `number`, `body`, `repo?` | `gh-post-comment.mjs` | **write** |

`get_pr`'s `ref` accepts `42`, `#42`, `owner/repo#42` or a PR URL. `normalize_pr` maps a PR fetched through REST or the GitHub MCP server (`pull_request_read` → `get`) to the field names `get_pr` emits ([ADR-010](adr/ADR-010-github-mcp-fallback-transport.md)).

`get_check_runs` takes a SHA only. `--merge-base` of the CLI script (local `git merge-base`, or the compare API with `--head`) is not exposed.

Results are the scripts' JSON, as text. Their `source` field (`graphql`, `rest`, `rest+ccr`) says which transport answered.

### Errors

| Case | Result |
|---|---|
| Unknown tool name | JSON-RPC error `-32602` |
| Invalid arguments (wrong type, unknown property, bad `repo`/`sha`, leading `-`) | tool result with `isError: true`, `Invalid arguments: …`; the script is not run |
| Script exits non-zero (`gh` unauthenticated, not found, …) | tool result with `isError: true` and the script's stderr |
| Script runs longer than 120 s | killed, reported as a failure |

### `post_comment` is gated

It posts a plain issue/PR comment — never a review verdict, an approval or a merge ([ADR-001](adr/ADR-001-human-as-gate.md), [ADR-012](adr/ADR-012-pr-review-posts-report.md)).

- Client declares the MCP `elicitation` capability → the server asks the user to confirm, showing repository, number and full body. Only an explicit *accept* with `confirm: true` posts. Decline, cancel, dismissal or a disconnected client mean **not posted** (`isError: true`).
- Client without elicitation → the call runs, and the host's own tool-approval prompt is the gate. Do not auto-approve this tool unless you mean it. The tool is annotated `readOnlyHint: false`, `destructiveHint: false`.

## Prompts

Each file of `commands/` is a prompt of the same name: `ac-check`, `bug-seeker`, `check-releases`, `demo-prep`, `issue-code-generation`, `issue-notes`, `loop-insights`, `pr-fixer`, `pr-review`, `resume`, `token-audit`. `sync-ai-dev-tools` is excluded: it administers a Claude Code install.

Each takes one optional argument, `arguments`, substituted for `$ARGUMENTS` (for example `42` for `ac-check`). `${CLAUDE_PLUGIN_ROOT}` becomes the absolute path of the clone, so the script paths in the prompt resolve from any working directory ([ADR-013](adr/ADR-013-plugin-distribution-and-script-paths.md)). A fixed preamble tells the host to read named subagents from the resources below.

The prompts are the Claude Code command bodies, unmodified. A host without a shell tool cannot run the `node …` steps (the matching MCP tools cover the GitHub reads), and a few commands assume Claude Code itself: `token-audit` reads `~/.claude/projects/`, `resume` reads checkpoints written by `/issue-code-generation`.

## Resources

Each file of `agents/` is a read-only resource, `ai-dev-tools://agents/<name>` (`pr-analyst`, `code-reviewer`, `ticket-analyst`, …), MIME type `text/markdown`. Where a prompt says "pass this to the `pr-analyst` agent", a host without subagents reads that resource and follows it as instructions; the `### Status / ### Handoff` output contract ([ADR-003](adr/ADR-003-structured-agent-output-contract.md)) is unchanged. `${CLAUDE_PLUGIN_ROOT}` is substituted as in prompts.

## Security model

- **Input validation precedes execution.** Per tool, a pure function checks the input and builds the argument vector (`scripts/mcp-tools.mjs`). `repo` must match `owner/repo`; `sha` must be hex; `number`, `limit` positive integers; `state` one of three values.
- **No flag injection.** Free-text positionals (`ref`, `branch`) may not start with `-`.
- **No shell.** Scripts are started with `spawn(node, [script, …args])`.
- **Author-controlled text never reaches argv.** The comment body and the PR object go through the child's stdin.
- **Scope.** Only GitHub I/O scripts are exposed. `onboarding`, `sync-claude`, `update-repos`, `checkpoint`, `token-audit`, `list-files` and `check-releases` read or write the local machine and stay CLI-only.
- **Credentials.** The server holds none: GitHub access is whatever `gh` is authenticated as, in the environment the host starts the server with. Tool output may contain private repository content and is returned to the host (and its model).

## Protocol coverage

Implemented: `initialize`, `ping`, `tools/list`, `tools/call`, `prompts/list`, `prompts/get`, `resources/list`, `resources/read`, `notifications/initialized` (ignored), server-initiated `elicitation/create`.

Not implemented: `listChanged` notifications, resource subscriptions and templates, pagination cursors, `outputSchema` / `structuredContent`, cancellation, progress, logging, completion. Batched requests (arrays) are rejected as invalid, as in `2025-06-18`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Host reports the server failed to start | Relative path or wrong Node: use an absolute path; check `node --version` ≥ 20 |
| Every GitHub tool returns `isError` with a `gh` message | `gh` missing or unauthenticated *in the environment the host started the server with* (GUI hosts do not always inherit your shell's environment, `GH_TOKEN` included) |
| `Could not determine repository. Pass --repo` | Omitted `repo` and the server's working directory is not a clone of the target: pass `repo` |
| `get_pr` without `ref`/`branch` rejected | It requires exactly one of them; the CLI's "current branch" default depends on the working directory and is not offered |
| `post_comment` returns "Not posted" | Confirmation declined or dismissed, or the client closed |
| Something unexpected in the host's server log | The server writes only unexpected internal errors to stderr; stdout carries protocol messages only |

## Extending

To expose another script, add an entry to `TOOLS` in `scripts/mcp-tools.mjs`: `name`, `script`, `description`, `inputSchema` (`additionalProperties: false`), `annotations`, a pure `args(input)` that validates and returns the argv, and optional `stdin(input)`. Read-only by default; a write tool sets `write: true` and needs a confirmation path. `tests/mcp-tools.test.mjs` asserts the structural invariants (existing script, closed schema, `write` consistent with `readOnlyHint`, `post_comment` the only write tool — update that test deliberately if a second write tool is intended).

Tests: `node --test tests/mcp-tools.test.mjs tests/mcp-server.test.mjs` (registry and validation, protocol, elicitation paths, prompts and resources, and a real stdio process end to end).
