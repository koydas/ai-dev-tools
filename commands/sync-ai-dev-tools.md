# /sync-ai-dev-tools

Sync commands, agents, and prompts from this repo to `~/.claude`.

## Steps

1. Run `node scripts/sync-claude.mjs`
2. Review the output — files marked **new** or **updated** have been deployed; files marked **extra** exist in `~/.claude` but not in this repo (not deleted)
