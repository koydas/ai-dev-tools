# /context-read — focused code evidence extraction

Use a small worker to extract evidence from large source files without injecting the entire corpus into Claude Code's primary context.

## Invocation

```text
/ai-dev-tools:context-read "Where is the authentication token validated?" --paths src/auth.ts src/session.ts
```

Equivalent direct command from a trusted working tree:

```bash
export AI_DEV_TOOLS_CONTEXT_SHUNT=1
export ANTHROPIC_API_KEY=... # Provide securely; never commit secrets
node /path/to/ai-dev-tools/scripts/context-shunt.mjs \
  --question "Where is the authentication token validated?" \
  --paths src/auth.ts src/session.ts --json
```

Output: JSON `summary`, `citations` with locally verified `path`, 1-based `line`, exact `quote`, `model`, API `usage`, and character-count `proxy`. The script emits only model, usage and numeric proxies to stderr.

## Routing

The plugin registers a Claude Code `PreToolUse` hook for `Read`. When the environment opts in and a file is **over 350 lines**, regular, within the workspace, non-secret by path, UTF-8 and at most 240,000 bytes, a full-file read is denied with instructions to use this command or a targeted `Read`.

The hook intentionally leaves small files, `offset`/`limit` reads, non-opted-in sessions, disallowed files and API-key-less sessions untouched. It never grants permissions. It does **not** catch Bash, other tools or explicit `@` file references.

## Errors

No retry; API calls time out after 90 seconds. HTTP failures, incomplete responses, malformed JSON and invalid citations produce no accepted answer. Fall back to targeted `Read` for precise investigation. See [architecture](../context-shunt.md).
