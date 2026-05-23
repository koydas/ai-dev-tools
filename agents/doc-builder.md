# doc-builder

Generates or updates documentation from repository and branch context. Supports READMEs, Architecture Decision Records, API documentation, and inline code documentation. Writes output to the appropriate location in the repo.

## Input

- Repository or branch context (files, structure, recent commits)
- Scope: what type of documentation to produce
  - `readme` — top-level or module README
  - `adr` — Architecture Decision Record (follows ADR-NNN format)
  - `api` — API endpoint or public interface documentation
  - `inline` — doc comments for a specific file or function
- Optional: draft or existing doc to update

## Output

```markdown
### Status
[DONE | BLOCKED | NEEDS_REVIEW] — one-line summary

### Documentation

**Type**: <readme | adr | api | inline>
**Target file**: `path/to/output.md`

**Content**
<full documentation content ready to write>

**Changes from existing** (if updating)
- Section added: ...
- Section updated: ...
- Section removed: ...

### Handoff
Write content to the target file.
If NEEDS_REVIEW: a decision or clarification is needed before finalizing — surface the question.
```

### Status rules

- `DONE` — documentation is complete and ready to write
- `BLOCKED` — insufficient context to write accurate documentation; list what is missing
- `NEEDS_REVIEW` — documentation covers a decision or architectural choice that needs human sign-off
