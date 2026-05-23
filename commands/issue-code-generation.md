# /issue-code-generation

Full issue → code → AC validation pipeline.

## Steps

1. Fetch the issue using `node scripts/gh-get-issue.mjs $ARGUMENTS` — captures title, body, labels, and comments as JSON
2. Pass the full issue JSON to the `ticket-analyst` agent
   - If status is `BLOCKED` or `NEEDS_REVIEW`, stop and surface the output for human decision
3. Pass the `### Brief` block from ticket-analyst to the `code-builder` agent
   - If status is `BLOCKED` or `NEEDS_REVIEW`, stop and surface the output
4. Pass the `### Patch` block from code-builder plus the original acceptance criteria to the `code-reviewer` agent
5. If code-reviewer status is `NEEDS_REVIEW`, write the review report and stop — present blocking issues to the user
6. If code-reviewer status is `DONE`, present the full patch to the user for review and merge approval
