# /issue-code-generation

Full issue → code → AC validation pipeline.

## Steps

1. Fetch the issue using `node scripts/gh-get-issue.mjs $ARGUMENTS` — captures title, body, labels, and comments as JSON
2. Pass the full issue JSON to the `issue-router` agent
   - If status is `NEEDS_REVIEW`, stop and surface the classification uncertainty for human decision
   - The router returns a **type** (`bug`, `feature`, `refactor`, `security`) used in step 4
3. Pass the full issue JSON to the `ticket-analyst` agent
   - If status is `BLOCKED` or `NEEDS_REVIEW`, stop and surface the output for human decision
4. Pass the `### Brief` block from ticket-analyst to the code-builder variant selected by the router:
   - `bug` → `code-builder-bug`
   - `feature` → `code-builder-feature`
   - `refactor` → `code-builder-refactor`
   - `security` or unclassified → `code-builder` (generic fallback)
   - If status is `BLOCKED` or `NEEDS_REVIEW`, stop and surface the output
5. Pass the `### Patch` block from code-builder plus the original acceptance criteria to the `code-reviewer` agent
6. If code-reviewer status is `NEEDS_REVIEW`, write the review report and stop — present blocking issues to the user
7. If code-reviewer status is `DONE`, present the full patch to the user for review and merge approval
