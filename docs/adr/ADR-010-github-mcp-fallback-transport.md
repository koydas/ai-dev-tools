# ADR-010 — GitHub MCP as Fallback Transport for Script I/O

**Status:** Accepted  
**Date:** 2026-10-05

## Context

ADR-007 puts all external I/O in Node scripts, and every GitHub script shells out to the `gh` CLI. In a Claude Code cloud session `gh` is installed but not authenticated (`GH_TOKEN` invalid); GitHub is reachable only through the GitHub MCP server. Reviewing koydas/autonomous-dev-loop#176 with `/pr-review` in such a session failed at step 2: none of `gh-get-pr.mjs`, `gh-get-pr-threads.mjs` or `gh-get-check-runs.mjs` could run, and the whole fetch had to be redone by hand with MCP tools.

ADR-007 rejected "inline tool calls in agents" because the model may hallucinate or misformat API data. An MCP tool call is a structured call with a typed response, not a generated one; the remaining risk is shape drift: the agents downstream expect `gh-get-pr.mjs` field names (`headRefOid`, `isCrossRepository`, …), and an MCP response uses others (`head.sha`, `head.repo.full_name`, …). A hand-mapped field is exactly the kind of logic ADR-005 keeps out of commands.

## Decision

`gh` stays the primary transport. When it is unavailable, a command may fetch the same data with GitHub MCP tools, under three rules:

1. **Preflight.** The command runs `gh auth status` first. Exit 0 → scripts as before. Non-zero → MCP fallback, announced once to the user.
2. **Normalization stays in scripts.** The raw MCP response is saved to a file and passed to a pure normalization script (`scripts/normalize-pr.mjs` for PR metadata), which emits the `gh-get-pr.mjs` field names. The file is written outside the working tree, so the tree stays exactly the PR head for the checks. The command never maps fields itself.

   **Exception — review threads.** `/pr-review` passes the `get_review_comments` response to pr-analyst unnormalized, labelled as raw MCP output, until a `normalize-threads.mjs` can be written and tested against a recorded non-empty response. No field is mapped by the command in the meantime.
3. **No silent degradation.** Data with no MCP equivalent is not approximated: it is passed as missing, and the agent applies its existing rule for missing input. For `/pr-review`, the MCP server's PR tools expose check runs for the PR head only, not for an arbitrary commit (the merge-base), so no base CI is passed and pr-analyst reports failures as `FAIL`, never `PRE_EXISTING`.

Write operations (`gh-post-comment.mjs`) may use the MCP equivalent only after the same human confirmation the command already requires.

## Alternatives considered

- **Require `gh` everywhere** — keeps one transport, but makes every GitHub command unusable in cloud sessions, where the MCP server is the only authenticated path.
- **Port the scripts to `fetch` with a token** — deterministic, but needs a token in the environment; cloud sessions expose GitHub only through the MCP proxy.
- **Let the command map MCP fields inline** — no new script, but logic in a command (ADR-005) and an unchecked mapping that drifts silently.

## Consequences

**Positive**
- `/pr-review` works in cloud sessions with the same agent input shape.
- The mapping is unit-tested (`tests/normalize-pr.test.mjs`) against a recorded MCP response.

**Negative**
- Two transports to keep in sync: an MCP server change in response shape breaks the normalizer (it fails loudly on a missing `number` or head SHA rather than passing partial data).
- In fallback mode, `PRE_EXISTING` is unavailable, so a failure already red on the base blocks the review until a human checks it.

## Amendment — REST preflight (2026-10-05)

The `gh` scripts now call REST endpoints only (`scripts/gh-rest.mjs`): `gh pr view` / `gh issue view` / `gh repo view` went through GraphQL, which Claude Code cloud sessions refuse. In those sessions `gh auth status` fails (the `GH_TOKEN` is reported invalid) while `gh api repos/…` succeeds through the session proxy, so the `gh auth status` preflight sent `/pr-review` to the MCP fallback although the scripts would have worked — and lost the base CI input (`PRE_EXISTING`) for nothing. The preflight is now a REST call to the target repository (`gh api 'repos/{owner}/{repo}' --silent`): exit 0 → scripts, non-zero → MCP fallback as above. `normalizePr` is reused by `gh-rest.mjs`'s `toPr`, so both transports share one PR mapping.
