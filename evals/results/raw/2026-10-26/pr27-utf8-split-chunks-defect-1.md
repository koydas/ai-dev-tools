### Status
DONE — the MCP server, tool registry, ADR-016, docs and tests are in place and consistent with the acceptance criterion. All 143 tests pass.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md` (Tests) | PASS — 143/143, including `tests/mcp-server.test.mjs` and `tests/mcp-tools.test.mjs` |
| Reproduction | — | — | N/A — not a bug fix |
| Lint | — | — | N/A — no linter configured |
| Type-check | — | — | N/A — plain ESM `.mjs`, no type-checker configured |

**AC coverage**
- [x] Expose the toolbox as an MCP server (ADR-016). The server is `scripts/mcp-server.mjs`, a stdio JSON-RPC server with no dependencies. It serves tools, prompts (from `commands/`) and resources (from `agents/`).
- [x] Tools map onto the existing scripts. I checked each tool's argv against the script's CLI (`--repo`, `--branch`, `--state`, `--limit`, positional number or sha), and they match. `post_comment` and `normalize_pr` pass their text through stdin, which those scripts read.
- [x] The write is gated. `post_comment` asks for confirmation through elicitation when the client supports it. A decline, a dismissal or a vanished client counts as not posted (`mcp-server.mjs`, `confirmWrite` and `handle.abort`).
- [x] Repo conventions are followed: `spawn` without a shell, the CLI-entrypoint idiom, tests for the new scripts, an ADR, README and `CLAUDE.md` updates.

**Bugs / regressions**
- None found.

**Scope violations**
- None. All seven changed files belong to the feature.

**Missing tests**
- None blocking.

**Blocking issues** (must fix before merge)
- None.

**Non-blocking notes**
- `nit`: `.claude-plugin/plugin.json` stays at 0.2.0 although `scripts/` gained new files. This is acceptable because ADR-016 deliberately does not bundle the server in the plugin. Bump the version if you want the new scripts to reach plugin installs.
- `nit`: `post_comment` runs without any confirmation when the client lacks elicitation. This is documented in ADR-016 as relying on the host's own tool approval.

### Handoff
Ready for human review and merge.
