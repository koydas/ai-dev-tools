# /bug-seeker

Interactive investigation — correlate issue, logs, and code to produce a diagnostic report.

## Steps

1. Fetch the issue: `node scripts/gh-get-issue.mjs $ARGUMENTS`
2. Read the issue title, body, and any reproduction steps or error messages
3. Search the codebase for the relevant code paths mentioned in the issue:
   - Entry points, error boundaries, and data flow related to the symptom
   - Look for recent commits in the affected area (`git log --oneline -- <path>`)
4. Ask the user for any relevant logs or stack traces if not in the issue
5. Correlate findings: map error message → code path → likely root cause
6. Produce a diagnostic report:
   - **Symptom**: what the user observes
   - **Root cause** (or candidates if uncertain): file, line, why it fails
   - **Reproduction path**: steps to reproduce
   - **Proposed fix**: minimal change to address the root cause
   - **Risks**: what else could be affected
7. Ask the user to confirm the diagnosis before proceeding to a fix
8. If confirmed, hand off to `/issue-code-generation` or proceed directly with code-builder
