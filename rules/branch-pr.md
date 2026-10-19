# branch-pr

Branch, commit, and PR naming conventions. Applied whenever creating a branch or opening a PR.

## Branch names

```
<type>/<issue-number>-<short-slug>
```

Examples:
- `feat/42-rate-limiting`
- `fix/107-null-ref-on-logout`
- `chore/update-node-20`
- `docs/adr-009-caching`

**Rules**:
- Lowercase, hyphens only (no underscores or dots)
- Include the issue number when a ticket exists
- Slug ≤ 5 words, describes the change not the ticket title
- No `/` inside the slug — one level of nesting only

## PR title

```
<type>(<scope>): <subject>
```

Same format as commit subject. The PR title becomes the squash-merge commit message.

Examples:
- `feat(api): add rate limiting middleware`
- `fix(auth): resolve null ref on logout`

## PR description template

```markdown
## What
<!-- One paragraph: what changed and why -->

## How
<!-- Key implementation decisions, alternatives considered -->

## Testing
<!-- How you tested it; link to relevant tests -->

## AC checklist
- [ ] AC item from the issue
- [ ] ...

Closes #<issue-number>
```

## PR rules

- Every PR must reference an issue (`Closes #N` or `Refs #N`)
- Draft PR immediately after first commit — keeps work visible
- At least one approval before merge
- All CI checks must pass
- No direct merges without a PR (except emergency hotfixes with post-hoc documentation)
