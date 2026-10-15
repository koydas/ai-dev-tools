---
description: "Sync ai-dev-tools commands, agents and prompts into ~/.claude"
---

# /sync-ai-dev-tools

Sync commands, agents, and prompts from this repo to `~/.claude`.

## Steps

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/sync-claude.mjs"`
2. Review the output — files marked **new** or **updated** have been deployed; files marked **extra** exist in `~/.claude` but not in this repo (not deleted)
