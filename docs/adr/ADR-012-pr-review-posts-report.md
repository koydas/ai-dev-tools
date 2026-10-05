# ADR-012 — /pr-review Posts Its Report on the PR

**Status:** Accepted  
**Date:** 2026-10-05

## Context

`/pr-review` wrote its report to a local file and, only when the status was `DONE`, offered to post a summary comment after confirmation. In practice:

- the review the author and other reviewers need — above all a `NEEDS_REVIEW` one, with its blocking issues — stayed on the reviewer's machine (or in an ephemeral cloud container) unless it was copied by hand;
- the confirmation step was asked on every run and always answered yes;
- `gh-post-comment.mjs` used `gh issue comment`, which goes through GraphQL; Claude Code cloud sessions refuse GraphQL (HTTP 403), so posting failed there.

## Decision

- `/pr-review` posts the full report as a PR comment **on every run, whatever the status** (`DONE` or `NEEDS_REVIEW`), after writing the local file.
- Invoking `/pr-review` is the consent to post: the invocation gate of [ADR-001](ADR-001-human-as-gate.md) covers it, no extra confirmation is asked.
- The comment is a plain issue comment, never a GitHub review: it does not approve or request changes. Merge and fix decisions stay with the human (merge and review gates unchanged).
- In the MCP fallback ([ADR-010](ADR-010-github-mcp-fallback-transport.md)), the report is posted with `add_issue_comment` on every run too: this supersedes ADR-010's "only after the same human confirmation" for `/pr-review`.
- `gh-post-comment.mjs` posts through the REST API (`gh api POST repos/<owner>/<repo>/issues/<n>/comments`), the body passed as JSON on stdin — never on the command line.

## Consequences

**Positive**
- The review lands where the author and reviewers look, including blocking findings
- Works in environments without GraphQL
- One fewer confirmation per review

**Negative**
- Each run adds a comment; re-reviewing the same PR posts a new one rather than updating the previous
- A report with a wrong finding is public as soon as it is produced — corrections go in a follow-up run or comment

## Alternatives considered

- **Keep the confirmation** — rejected: always answered yes, and blocked `NEEDS_REVIEW` reports from being shared
- **Post only on `NEEDS_REVIEW`** — rejected: a `DONE` report with its evidence table is the record a merger wants to see
- **Update a single marker comment** — deferred: needs a lookup of previous comments; a new comment per run keeps the history of successive reviews
