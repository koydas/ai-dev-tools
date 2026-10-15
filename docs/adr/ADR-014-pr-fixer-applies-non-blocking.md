# ADR-014 — /pr-fixer Applies In-Scope Non-Blocking Findings, Nits Included

**Status:** Accepted  
**Date:** 2026-10-15

## Context

`/pr-fixer` applied only the `**Blocking issues**` of a review report. `pr-analyst` sends every other finding — including `Low · introduced` — to "a follow-up issue". In practice those issues are rarely filed: the findings are lost once the PR merges, or the author asks for them by hand in a second pass (PR koydas/autonomous-dev-loop#214: two code fixes and a CI job, requested right after the blocking pass).

## Decision

- **Two sources only: the `/pr-review` report and trusted humans.** `/pr-fixer` reads the local report (or the latest one posted on the PR by a trusted author) and the human comments, review bodies and unresolved threads of the PR (`scripts/gh-get-pr-feedback.mjs`). **Trusted** means `author_association` `OWNER`, `MEMBER` or `COLLABORATOR` — the rule of autonomous-dev-loop's `isTrustedReviewComment` (its ADR-0028): anyone can comment on a public PR, so text from an outsider — report-shaped or not — never becomes a fix instruction. Bots (`type: Bot`, `[bot]` logins — Codex, Claude Code Review, CI) and resolved threads are never read; generated comments on a human account (Claude Code footer, machine markers like `<!-- adl-review … -->`), outsiders and authors of unknown type are listed for the user, never applied. In a kept thread only the trusted human comments are requests; a bot root stays as context. Classification is a pure, tested function — the author's login alone cannot tell a human from a tool posting with their token.
- A human comment is a request under the same scope rule; one that asks for no change or needs a design decision is skipped with the reason. Nothing is posted: `/pr-fixer` drafts one reply per human thread for the human to post after committing.
- `/pr-fixer` applies the blocking issues first, then the non-blocking findings of the report (`**Non-blocking suggestions**` from pr-analyst, `**Non-blocking notes**` from code-reviewer).
- **Nits are findings.** pr-analyst reports naming, typo, style, dead-code, stale-comment and doc-wording issues as `Low` findings tagged `nit`; code-reviewer tags them `nit` in its non-blocking notes. `/pr-fixer` applies them like any other non-blocking finding: `nit`, `style` or `optional` is never a reason to skip.
- **Scope rule** — a non-blocking finding is applied only when its fix stays in the PR's perimeter: the files the PR touches, plus the docs, tests and CI configuration of what the PR adds. It is skipped, with the reason stated, when:
  - its origin is `pre-existing` in a file the PR does not touch (a pre-existing finding in a touched file is applied);
  - the fix needs a new dependency, or changes a public API / schema the PR does not already change;
  - it is not a code change (label, issue, process action) — reported to the human.
- `--blocking-only` restores the previous behavior.
- Classification and status rules are unchanged: blocking vs non-blocking still drives `NEEDS_REVIEW` / `DONE` in `/pr-review`, and a skipped non-blocking finding never makes `/pr-fixer`'s re-review `NEEDS_REVIEW`.
- Nothing is committed automatically ([ADR-001](ADR-001-human-as-gate.md) merge gate unchanged).

## Consequences

**Positive**
- One pass from a review to a branch with nothing left to file — nits included, so no second "and the nits too" round
- Skips are explicit, with a reason — a finding is never silently dropped

**Negative**
- A tool that posts on a human account without a marker is read as human (e.g. the autonomous-dev-loop pipeline's review body) — to be fixed at the source by a marker (koydas/autonomous-dev-loop#215); until then code-builder skips it when it asks for nothing
- Larger patches per `/pr-fixer` run; the re-review covers more lines
- A Low finding the author would have declined is applied unless they pass `--blocking-only` or revert it at the review gate

## Alternatives considered

- **Read every PR comment, bots included** — rejected: bot findings (Codex, Claude Code Review) have their own triage; the author decides which reviewers `/pr-fixer` answers to (2026-10-15)
- **Trust any `User` account** — rejected: on a public repository a drive-by comment shaped like a report would become *the* review, and any request would reach code-builder, whose output the reviewer then executes checks on
- **Classify by login** — rejected: `/pr-review`, pipelines and the author all post with the author's token
- **Skip nits / optional findings** — rejected: they are the cheapest fixes and the most often lost; the author asked for them explicitly (2026-10-15)
- **Opt-in flag (`--all`)** — rejected: the default is what runs, and the default left the findings unfiled
- **Apply every finding, scope ignored** — rejected: widens a PR into unrelated code, against code-builder's authorized-scope rule
- **File follow-up issues automatically** — rejected: a network write per finding, and issues for one-line fixes that fit the PR
