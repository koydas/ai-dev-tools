---
description: "Draft proposals for changes to an autonomous-dev-loop deployment from its published findings (read-only)"
argument-hint: "[--finding <key>] [--source <https-url|path>]"
---

# /loop-insights

Read the findings export that autonomous-dev-loop publishes, and print a drafted proposal for each finding that has a lever. Read-only: nothing is posted, created or edited ([ADR-017](../docs/adr/ADR-017-loop-insights-command.md)).

## Steps

1. Fetch and validate the export: `node "${CLAUDE_PLUGIN_ROOT}/scripts/loop-insights.mjs" $ARGUMENTS`. The arguments are `--finding <key>` and `--source <https-url|path>`, both optional. The source defaults to `findings_url` in `configs/meta-loop.yaml`
2. If the script exits non-zero (unreachable source, unsupported `schema_version`, invalid shape, unknown finding key), print its message as `### Status` → `BLOCKED` with that reason, and stop: do not call the agent
3. Pass the script's JSON output, unchanged, to the `loop-analyst` agent. Pass nothing else: no file, no other repository content
4. Print the agent's report as returned
5. If `NEEDS_REVIEW`, surface the assumption it states and stop: the decision is the user's
6. Do not create an issue, pull request, comment, label, file or branch, and do not apply a proposal. What happens next is the user's decision, taken outside this command
