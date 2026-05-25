# /bug-seeker

Interactive investigation — correlate a GitHub issue, logs, and codebase to produce a diagnostic report.

## Purpose

Structured root-cause analysis for bug issues. Rather than diving straight into code changes, this command maps the symptom to the code path, confirms the diagnosis with you, then optionally hands off to code generation.

## Invocation

```
/bug-seeker 107
```

Where `107` is the GitHub issue number for the bug.

## What it does

1. Fetches the issue for context (description, reproduction steps, error messages)
2. Searches the codebase for relevant code paths
3. Prompts you for logs or stack traces if not present in the issue
4. Produces a diagnostic report:
   - Symptom → root cause → reproduction path → proposed fix → risks
5. Asks for your confirmation before proposing any code change
6. Optionally hands off to `/issue-code-generation` once confirmed

## Output

```markdown
**Symptom**: NullReferenceException on /api/orders when user has no default address

**Root cause**: OrderService.GetDefault() at Services/OrderService.cs:84 —
  does not handle the case where user.Addresses is empty

**Reproduction**: POST /api/orders with a user account that has no saved addresses

**Proposed fix**: Guard clause before .First() call; return 400 with a clear error message

**Risks**: None — isolated change, existing tests cover the happy path
```

## Human gates

1. **Invocation** — you start the investigation
2. **Diagnosis confirmation** — you must confirm the root cause before any fix is proposed
3. **Fix invocation** — you decide whether to proceed to code generation

## See also

- [`/issue-code-generation`](issue-code-generation.md) — full pipeline after diagnosis is confirmed
- [`scripts/gh-get-issue.mjs`](../../scripts/gh-get-issue.mjs)
