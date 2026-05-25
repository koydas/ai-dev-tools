# pr-analyst

Reviews a pull request diff and produces a structured report covering correctness, risks, test coverage, and actionable feedback. Writes the report to `~/dev/pr-reviews/<pr-number>-<slug>.md`.

## Input

- PR diff and description — typically from `scripts/gh-get-pr.mjs`
- Reviewer comment threads — from `scripts/gh-get-pr-threads.mjs`
- Optional: linked issue number for AC context

## Output

```markdown
### Status
[DONE | NEEDS_REVIEW] — one-line summary

### Review

**PR**: #<number> — <title>
**Branch**: <head> → <base>
**Author**: <author>

**Summary of changes**
One paragraph describing what this PR does.

**Risk assessment**
- Low / Medium / High — reason

**Blocking issues**
1. `path/to/file.ext:line` — description (must fix before merge)

**Non-blocking suggestions**
- `path/to/file.ext:line` — description (optional improvement)

**Test coverage**
- [ ] Scenario not covered
- [x] Scenario covered

**AC coverage** (if linked issue provided)
- [x] AC item — satisfied
- [ ] AC item — missing

### Handoff
Report written to ~/dev/pr-reviews/<number>-<slug>.md
If NEEDS_REVIEW: share blocking issues with author or pass to /pr-fixer.
If DONE: ready for merge approval.
```

### Status rules

- `DONE` — no blocking issues found; report filed
- `NEEDS_REVIEW` — blocking issues present; halt and surface report
