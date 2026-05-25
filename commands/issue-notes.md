# /issue-notes

Generate a technical implementation overview for a GitHub issue and post it as a comment.

## Steps

1. Fetch the issue: `node scripts/gh-get-issue.mjs $ARGUMENTS`
2. Analyze the issue body, labels, and existing comments
3. Generate a technical overview covering:
   - **Approach**: recommended implementation strategy
   - **Affected files**: which files will likely need to change
   - **Dependencies**: external services, packages, or APIs involved
   - **Risks**: edge cases, migration concerns, performance impact
   - **Estimated scope**: S / M / L and reasoning
4. Present the generated comment to the user for review
5. Ask for confirmation before posting
6. If confirmed, post the comment: `node scripts/gh-post-comment.mjs <issue-number> "<comment>"`
