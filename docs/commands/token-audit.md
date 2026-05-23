# /token-audit

Audit Claude Code token usage — trends, model breakdown, and command adoption.

## Purpose

Answers "how much am I spending on Claude Code and on what?" by parsing session JSONL files from `~/.claude/projects/` and aggregating usage metrics.

## Invocation

```
/token-audit        # last 30 days (default)
/token-audit 7      # last 7 days
/token-audit 90     # last 90 days
```

## What it does

1. Reads JSONL session files from `~/.claude/projects/**/*.jsonl`
2. Aggregates token counts within the requested date window
3. Presents a usage report

## Output

```
Token audit — last 30 days

Total tokens:  1,240,500
  Input:         840,200
  Output:        380,100
  Cache read:     20,200

Daily average: 41,350 tokens/day

Model breakdown:
  claude-opus-4-5      62%   769,110
  claude-sonnet-4-6    35%   434,175
  claude-haiku-4-5      3%    37,215

Top commands (by token consumption):
  /issue-code-generation   38%
  /pr-review               22%
  manual sessions          40%

High-usage sessions:
  2026-05-18  project-x  82,400 tokens
  2026-05-12  project-y  61,200 tokens
```

## See also

- [`scripts/token-audit.mjs`](../../scripts/token-audit.mjs) — the script this command delegates to
