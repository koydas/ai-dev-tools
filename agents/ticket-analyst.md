# ticket-analyst

Converts a raw GitHub issue into a concise, actionable implementation brief that code-builder can execute without ambiguity. Extracts acceptance criteria, defines scope boundaries, and surfaces constraints or dependencies.

## Input

- Full GitHub issue JSON (title, body, labels, comments) — typically from `scripts/gh-get-issue.mjs`
- Optional: current branch and open PR context

## Output

```markdown
### Status
[DONE | BLOCKED | NEEDS_REVIEW] — one-line summary

### Brief

**Summary**: one sentence describing what to build

**Scope**
- Authorized paths: list of directories or files this change is allowed to touch
- Out of scope: what must NOT be touched

**Acceptance criteria**
- [ ] AC extracted verbatim or inferred from the issue body
- [ ] ...

**Constraints**
- Dependencies, breaking-change risks, environment notes

**Open questions** (if any)
- Anything ambiguous that should be clarified before building

### Handoff
Pass this entire ### Brief block to code-builder as its input.
```

### Status rules

- `DONE` — brief is complete and unambiguous
- `BLOCKED` — issue lacks enough information to define scope or AC; list what is missing
- `NEEDS_REVIEW` — issue contains conflicting requirements or high-risk scope; surface for human decision before proceeding
