# ADR-011 — REST Fallback for GitHub Scripts That Use GraphQL

**Status:** Accepted  
**Date:** 2026-10-05

## Context

Some GitHub data is only complete over GraphQL: `gh pr view --json …` is GraphQL under the hood, and review-thread resolution (`isResolved`, `isOutdated`) exists only on the GraphQL `reviewThreads` connection. In a Claude Code cloud session, the egress proxy refuses GraphQL (`HTTP 403: GitHub GraphQL is not available from Claude Code sessions`) while REST works, and `gh repo view` fails the same way. `scripts/gh-get-pr-threads.mjs` therefore returned nothing in those sessions, so `/pr-review` had no threads, reviews or PR comments.

The same proxy exposes `GET /repos/{owner}/{repo}/pulls/{n}/ccr/review_threads`, which returns one entry per thread: `{ resolved, outdated, path, line, comment_ids }`. That route exists only behind the proxy; elsewhere it fails.

The original bug fixed by #15 is the risk to avoid: REST review comments carry no resolution state, and defaulting it to `false` reported every settled thread as open.

## Decision

A script that reads GitHub through GraphQL (directly or via a `gh` subcommand that uses it) follows this pattern:

1. **GraphQL first.** It is the complete source and stays the primary transport.
2. **REST on failure.** On any GraphQL failure, the script logs one line to stderr (`GraphQL unavailable (<reason>) — falling back to REST`) and fetches the same data over REST, with `--paginate` (and `--slurp` for lists), as for every `gh api` call.
3. **Pure mappers.** REST responses are mapped to the GraphQL output shape by exported pure functions, unit-tested against fixtures trimmed from real responses. The I/O functions only fetch and call them.
4. **Unknown is `null`, never a default.** A field REST cannot provide is `null`, and consumers must treat `null` as unknown. A field REST cannot provide is never filled with a plausible default such as `false`, `[]` or `0`. An optional enrichment source fills it when available. For resolution state that source is the `ccr/review_threads` route, tried and ignored on failure.
5. **Provenance in the output.** The output carries `source` (`graphql` | `rest+ccr` | `rest`), so the consumer and the human can see how complete the data is.
6. **Repository detection** does not depend on GraphQL: when `gh repo view` fails, the `origin` remote URL is parsed instead.

`scripts/gh-get-pr-threads.mjs` is the reference implementation: `buildThreads` (GraphQL), `buildThreadsFromRest` and `mapRestPrActivity` (REST), and `repoFromRemoteUrl`.

This pattern applies when `gh` is authenticated but GraphQL is refused. When `gh` itself is unusable, commands use the GitHub MCP fallback of ADR-010.

## Consequences

**Positive**
- `/pr-review` gets threads, reviews and PR comments in cloud sessions, with resolution state when the proxy provides it.
- Missing data is visible: a `null` field and a `source` other than `graphql`. It is never a value that only looks correct.
- Mapping logic stays pure and tested, per ADR-007.

**Negative**
- Two code paths per script to keep in sync with the output shape.
- The `ccr/review_threads` contract is not publicly documented; the mapper relies on the shape observed on koydas/autonomous-dev-loop#176. If the route changes, its data is ignored or incomplete, and the result degrades to `resolved: null`. It never degrades to a wrong value.
- REST threads have no GraphQL node id (`threadId: null`), so they cannot be resolved through GraphQL from that output.

## Alternatives considered

- **REST only** — one code path, but loses resolution state outside cloud sessions, where GraphQL works.
- **Default missing fields** (`resolved: false`) — the original bug: settled threads reported as open.
- **Fail when GraphQL is refused** — honest, but leaves `/pr-review` without thread context in cloud sessions, although REST could provide most of it.
