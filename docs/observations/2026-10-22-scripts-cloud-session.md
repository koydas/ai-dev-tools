# Script behavior observations — Claude Code cloud session

- Date: 2026-10-22 · Node v22.22.0 · commit `15845e8` (+ branch `claude/ai-dev-tools-behavior-observation-r1tjb5`)
- Environment: claude.ai/code container. `gh` present but `gh auth status` fails (`GH_TOKEN` rejected by the login check); `gh api` works through the session proxy; GraphQL answers HTTP 403.
- Method: each script run as a child process (argv, stdin, exit code, wall time, stdout/stderr). Mutating scripts only against scratch dirs or `--dry-run`. `gh-post-comment` never run against a real target. `node --test`: 160/160 pass.
- Single run per case — latencies are indicative, not statistics.

## Matrix

| Script | Case | Exit | Time | Observation |
|---|---|---|---|---|
| gh-get-pr | `1 --repo koydas/ai-dev-tools` | 0 | 2.1 s | `source: "rest"`; one stderr line `GraphQL unavailable (HTTP 403 …) — falling back to REST` |
| gh-get-pr | `--branch <this branch>` | 1 | 1.1 s | no open PR → explicit error, no stdout |
| gh-get-pr | `--bogus` | 1 | 1.2 s | unknown flag **not rejected**: falls through to current-branch lookup (see O3) |
| gh-get-issue | `1` | 0 | 1.4 s | `source: "rest"` |
| gh-get-pr-threads | `1` | 0 | 2.6 s | `source: "rest+ccr"` (resolution state from the `ccr/review_threads` route) |
| gh-get-pr-feedback | `1` | 0 | 2.9 s | `source: "rest+ccr"`, `latestPrReview: null`, `excluded.bot: 2` (Codex reviews dropped by design, ADR-014) |
| gh-get-check-runs | `--merge-base` | 0 | 0.6 s | no GraphQL involved, no fallback line; sha resolved locally |
| gh-my-issues | `--limit 3` | 0 | 1.2 s | REST fallback via `gh api user` → `No issues found.` (correct: `koydas` has no assigned issue; `@me` GraphQL resolution is the 403) |
| gh-post-comment | `abc x` | 1 | 0.04 s | rejected before any network call |
| loop-insights | local fixture | 0 | 0.04 s | 4 findings, `status: critical` |
| loop-insights | `--finding nope` | 1 | 0.03 s | error lists valid keys |
| loop-insights | `http://…` | 1 | 0.04 s | scheme refused |
| loop-insights | default URL | 1 | 0.10 s | `cannot reach https://koydas.github.io/… : fetch failed` (sandbox egress) |
| token-audit | `--days 7` | 0 | 0.07 s | 1 session (the current one) |
| checkpoint | `list` | 0 | 0.03 s | `(none)` |
| checkpoint | `write`/`read` with step `step` | 1 | 0.04 s | **raw stack trace** (O4) |
| checkpoint | issueId `../x` | 1 | 0.03 s | traversal refused (stack trace as above) |
| report-path | `--dir` | 0 | 0.05 s | `/root/dev/pr-reviews` (directory does not exist; not created by this script) |
| report-path | `--from-pr`, title `Fix: a/b $(rm) ünï` | 0 | 0.04 s | `7-fix-a-b-rm-uni.md` — slug is safe |
| list-files / normalize-pr / check-releases / sync-claude / onboarding `--dry-run` | error and happy paths | as expected | <0.05 s | `sync-claude` marks everything `[new]` on an empty dst; `onboarding --dry-run` writes nothing |
| mcp-server | initialize, tools/list, tools/call ×2, unknown method | — | — | v0.3.0; invalid arg → `isError: true` with message; unknown method → JSON-RPC `-32601`; `get_issue` result identical to the CLI |

## Observations

- **O1 — GraphQL is a guaranteed failed round-trip in cloud sessions.** Every `gh pr/issue view` script pays one 403 before REST: ~0.5–1 s of the 1.2–2.9 s wall time. The fallback is correct and visible (`source`, stderr line), but nothing short-circuits it once the first call has failed. Candidate: memoize "GraphQL unavailable" per process (already per call) or skip it when `CLAUDE_CODE_REMOTE` is set. Trade-off: environment sniffing vs. 1 s per call; a pipeline like `/pr-review` chains 3–4 scripts.
- **O2 — `gh auth status` is red yet `gh api` works.** Scripts must not gate on `gh auth status`; none do.
- **O3 — Unknown flags are silently ignored by `gh-get-pr`** (`--bogus` → branch lookup on the current branch). Other scripts (`loop-insights`) validate flags and print Usage. Not verified for the other `gh-*` scripts.
- **O4 — `checkpoint.mjs` surfaces validation errors as uncaught exceptions** (stack trace on stderr, exit 1). Every other script prints `Error …` + Usage and exits 1. Exit code is the same, so only readability and consistency are affected.
- **O5 — `token-audit` totals exclude cache tokens.** "Total tokens 7,487" vs. cache read 639,819 / write 134,702 in the same output; per-session ranking is therefore by input+output only.
- **O6 — `loop-insights` default source unreachable from this sandbox**, error carries no cause (`fetch failed`). Local `--source` works.
- **O7 — `rest+ccr` is specific to Claude Code sessions** (`pulls/{n}/ccr/review_threads`); outside, thread resolution is `null` (unknown, ADR-011). Not exercised here — no non-ccr environment available.

## Not observed

- Real GraphQL path (blocked here), `gh-post-comment` and MCP `post_comment` success/confirmation path (write), `update-repos`, `check-releases` on real repos, pagination on PRs with >100 comments/threads.

## Reproduce

Harness: spawn `node scripts/<name>.mjs` with `spawnSync`, record `status`, wall time, first bytes of stdout/stderr. Not committed (scratch).
