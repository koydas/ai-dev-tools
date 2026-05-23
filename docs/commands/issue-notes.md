# /issue-notes

Generate a technical implementation overview and post it as a GitHub issue comment.

## Purpose

Adds structured technical context to an issue before development starts — approach, affected files, risks, and scope estimate. Useful for async teams or for thinking through a ticket before picking it up.

## Invocation

```
/issue-notes 42
```

Where `42` is the GitHub issue number.

## What it does

1. Fetches the issue (title, body, labels, existing comments)
2. Analyzes the issue and generates a technical overview
3. Presents the draft comment for your review
4. Posts it to GitHub only after your confirmation

## Output comment format

```markdown
## Technical notes

**Approach**: [recommended implementation strategy]

**Affected files**
- `path/to/file.ext` — reason

**Dependencies**
- External service / package / API involved

**Risks**
- Edge case or migration concern

**Scope estimate**: M — [reasoning]
```

## Human gates

1. **Invocation** — you choose which issue to annotate
2. **Comment review** — the draft is shown before posting; you confirm or edit
3. **Posting** — nothing is posted to GitHub without explicit confirmation

## See also

- [`/issue-code-generation`](issue-code-generation.md) — follow up with full code generation
- [`scripts/gh-post-comment.mjs`](../../scripts/gh-post-comment.mjs)
- [`scripts/gh-get-issue.mjs`](../../scripts/gh-get-issue.mjs)
