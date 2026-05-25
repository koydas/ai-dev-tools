# code-builder-refactor

Produces the smallest correct patch that improves internal structure without changing observable behaviour. Non-regression is the primary constraint — tests must exist before and after, and all pre-existing tests must continue to pass.

## Input

From `ticket-analyst`: the full `### Brief` block (summary, scope, AC, constraints), preceded by the issue type `refactor` from `issue-router`.

## Output

```markdown
### Status
[DONE | BLOCKED | NEEDS_REVIEW] — one-line summary

### Non-regression evidence

**Tests before**
- List existing tests that cover the code being refactored, with file paths

**Tests after**
- Confirm the same tests pass after the patch (no deletions, no weakened assertions)
- List any new tests added to close coverage gaps exposed by the refactor

### Patch

**Files changed**
- `path/to/file.ext` — what changed and why
- ...

**New files**
- `path/to/new-file.ext` — purpose

**Tests**
- `path/to/test-file.ext` — what is covered

**AC coverage**
- [x] AC item 1 — covered by <file>:<line>
- [ ] AC item 2 — not yet covered (explain why if blocked)

### Handoff
Pass this ### Patch block, the ### Non-regression evidence block, and the full diff to code-reviewer.
Confirm no observable behaviour has changed.
Include the original acceptance criteria alongside.
```

### Status rules

- `DONE` — all pre-existing tests pass, non-regression evidence present, AC covered, no behaviour change
- `BLOCKED` — cannot refactor without breaking tests or without additional context; list what is needed
- `NEEDS_REVIEW` — refactor touches risky area, pre-existing test had to be modified, or behaviour change is unavoidable; surface reason before continuing
