# /issue-code-generation

Full issue → code → AC validation pipeline.

## Steps

1. Fetch the issue using `node scripts/gh-get-issue.mjs $ARGUMENTS` — captures title, body, labels, and comments as JSON
2. Pass the full issue JSON to the `issue-router` agent
   - If status is `NEEDS_REVIEW`, stop and surface the classification uncertainty for human decision
   - The router returns a **type** (`bug`, `feature`, `refactor`, `security`) used in step 4
   - Write checkpoint: pipe agent output to `node scripts/checkpoint.mjs write <issueId> 01-router`
3. Pass the full issue JSON to the `ticket-analyst` agent
   - If status is `BLOCKED` or `NEEDS_REVIEW`, stop and surface the output for human decision
   - Write checkpoint: pipe agent output to `node scripts/checkpoint.mjs write <issueId> 02-brief`
4. Pass the `### Brief` block from ticket-analyst to the code-builder variant selected by the router:
   - `bug` → `code-builder-bug`
   - `feature` → `code-builder-feature`
   - `refactor` → `code-builder-refactor`
   - `security` or unclassified → `code-builder` (generic fallback)
   - If status is `BLOCKED` or `NEEDS_REVIEW`, stop and surface the output
   - Write checkpoint: pipe agent output to `node scripts/checkpoint.mjs write <issueId> 03-patch`
5. **If `--strict` flag is present**, pass to the `code-challenger` agent: the `### Patch` block, the original acceptance criteria, and the issue type
   - If status is `BLOCKED` or `NEEDS_REVIEW`, stop and surface the output for human decision before continuing
   - On `DONE`, carry the `### Handoff` block (critical points list) forward to step 6
   - Skip this step entirely if `--strict` was not passed
   - Write checkpoint: pipe agent output to `node scripts/checkpoint.mjs write <issueId> 04-challenges`
6. Pass to the `code-reviewer` agent: the `### Patch` block, the original acceptance criteria, and any type-specific evidence blocks produced by the builder:
   - `bug` → include `### Reproduction`
   - `refactor` → include `### Non-regression evidence`
   - `feature` / `security` / fallback → `### Patch` only
   - If `--strict` was used, also include the `### Handoff` block from code-challenger so the reviewer is aware of pre-identified risks
   - Write checkpoint: pipe agent output to `node scripts/checkpoint.mjs write <issueId> 05-review`
7. If code-reviewer status is `NEEDS_REVIEW`, write the review report and stop — present blocking issues to the user
8. If code-reviewer status is `DONE`, present the full patch to the user for review and merge approval
