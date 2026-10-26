### Status
DONE — the MCP server, tool registry, ADR-016, docs and tests are in place and consistent with the acceptance criterion. All 144 tests pass.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md` (Tests) | PASS — 144/144 (includes `tests/mcp-tools.test.mjs` and `tests/mcp-server.test.mjs`) |
| Reproduction | — | — | N/A — not a bug fix, no builder evidence |
| Lint | — | — | N/A — no linter configured |
| Type-check | — | — | N/A — plain ESM `.mjs`, no type-checker configured |

**AC coverage**
- [x] Toolbox exposed as an MCP server (ADR-016):
  - `scripts/mcp-server.mjs` is a zero-dependency stdio JSON-RPC server. It has `initialize`, `tools/*`, `prompts/*`, `resources/*` and `ping`.
  - `scripts/mcp-tools.mjs` is the tool registry.
  - `docs/adr/ADR-016-mcp-server.md` records the decision.
  - `README.md` and `CLAUDE.md` document it.
- [x] Tool argv matches each script's CLI. I checked the `--repo`, `--branch`, `--state` and `--limit` flags. The `post_comment` body and the `normalize_pr` object go through stdin, which both scripts read.
- [x] Input validation: unknown properties are rejected, `repo` and `sha` are pattern-checked, and free-text positionals may not start with `-`.
- [x] Human gate on the write:
  - `post_comment` asks for confirmation through elicitation when the client supports it.
  - A decline, a dismissal or a client that has gone away all count as not posted.
  - Without elicitation it runs and relies on the host's own tool approval, as ADR-016 §5 states.
- [x] Scripts run via `spawn` without a shell, output is decoded as a UTF-8 stream (the second commit), and there is a timeout.
- [x] Conventions: ESM, CLI-entrypoint detection via `fileURLToPath`, no external dependencies. The MCP tool convention is added to `CLAUDE.md`.

**Bugs / regressions**
- None found.

**Scope violations**
- None. The changes touch only new MCP files, tests, the ADR and docs.

**Missing tests**
- None blocking. The registry and the protocol end to end over a real stdio process are covered.

**Blocking issues**
- None.

**Non-blocking notes**
- `nit`: `.claude-plugin/plugin.json` stays at 0.2.0 although `scripts/` gained new files. ADR-016 deliberately does not bundle the server in the plugin, so this is probably fine.
- `nit`: `get_check_runs` does not expose the script's `--merge-base` mode. This is consistent with the ADR, but worth knowing.
- `nit`: `MAX_OUTPUT` stops appending once a buffer passes 32 MiB, so oversized output is silently truncated with no marker.

### Handoff
Ready for human review and merge.
