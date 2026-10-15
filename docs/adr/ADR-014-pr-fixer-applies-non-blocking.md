# ADR-014 — /pr-fixer Applies In-Scope Non-Blocking Findings

**Status:** Accepted  
**Date:** 2026-10-15

## Context

`/pr-fixer` applied only the `**Blocking issues**` of a review report. `pr-analyst` sends every other finding — including `Low · introduced` — to "a follow-up issue". In practice those issues are rarely filed: the findings are lost once the PR merges, or the author asks for them by hand in a second pass (PR koydas/autonomous-dev-loop#214: two code fixes and a CI job, requested right after the blocking pass).

## Decision

- `/pr-fixer` applies the blocking issues first, then the non-blocking findings of the report (`**Non-blocking suggestions**` from pr-analyst, `**Non-blocking notes**` from code-reviewer).
- **Scope rule** — a non-blocking finding is applied only when its fix stays in the PR's perimeter: the files the PR touches, plus the docs, tests and CI configuration of what the PR adds. It is skipped, with the reason stated, when:
  - its origin is `pre-existing` in code the PR does not touch;
  - the fix needs a new dependency, or changes a public API / schema the PR does not already change;
  - it is not a code change (label, issue, process action) — reported to the human.
- `--blocking-only` restores the previous behavior.
- Classification and status rules are unchanged: blocking vs non-blocking still drives `NEEDS_REVIEW` / `DONE` in `/pr-review`, and a skipped non-blocking finding never makes `/pr-fixer`'s re-review `NEEDS_REVIEW`.
- Nothing is committed automatically ([ADR-001](ADR-001-human-as-gate.md) merge gate unchanged).

## Consequences

**Positive**
- One pass from a review to a branch with nothing left to file
- Skips are explicit, with a reason — a finding is never silently dropped

**Negative**
- Larger patches per `/pr-fixer` run; the re-review covers more lines
- A Low finding the author would have declined is applied unless they pass `--blocking-only` or revert it at the review gate

## Alternatives considered

- **Opt-in flag (`--all`)** — rejected: the default is what runs, and the default left the findings unfiled
- **Apply every finding, scope ignored** — rejected: widens a PR into unrelated code, against code-builder's authorized-scope rule
- **File follow-up issues automatically** — rejected: a network write per finding, and issues for one-line fixes that fit the PR
