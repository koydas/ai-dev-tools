# /issue-code-generation

Full pipeline from a GitHub issue to a reviewed code patch, with a human gate before merge.

## Purpose

Automates the most repetitive part of feature development: reading the ticket, understanding scope, writing the code, and validating it against acceptance criteria. You stay in the loop at every `NEEDS_REVIEW` checkpoint.

## Invocation

```
/issue-code-generation 42
```

Where `42` is the GitHub issue number.

## Pipeline

```
gh-get-issue → ticket-analyst → code-builder → code-reviewer → human merge gate
```

| Step | Agent / Script | Output |
|------|---------------|--------|
| Fetch issue | `gh-get-issue.mjs` | Raw issue JSON |
| Parse brief | `ticket-analyst` | Scope, AC, constraints |
| Build patch | `code-builder` | Files changed, tests |
| Review | `code-reviewer` | AC checklist, bugs, blocking issues |

## Output

If the pipeline runs to completion without a `NEEDS_REVIEW` halt:
- A diff of all changed files
- An AC checklist confirming each criterion is covered
- Confirmation that tests are present

If a `NEEDS_REVIEW` is raised at any stage, the pipeline stops and surfaces:
- The agent that raised it
- The specific issue (missing AC, scope violation, ambiguous requirement)
- A recommended next action

## Human gates

1. **Invocation** — you decide when to run it
2. **NEEDS_REVIEW checkpoint** — any agent can halt the pipeline
3. **Merge** — the patch is never committed or pushed automatically

## See also

- [`agents/ticket-analyst.md`](../../agents/ticket-analyst.md)
- [`agents/code-builder.md`](../../agents/code-builder.md)
- [`agents/code-reviewer.md`](../../agents/code-reviewer.md)
- [`/ac-check`](ac-check.md) — run the review step alone on an existing branch
- [`/pr-fixer`](pr-fixer.md) — apply blocking fixes from a review
