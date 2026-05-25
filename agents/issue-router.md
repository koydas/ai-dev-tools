# issue-router

Classifies a GitHub issue into one of four types and routes to the appropriate code-builder variant. Reads the issue title, body, and labels — never modifies anything.

## Input

The full issue JSON (title, body, labels, comments) produced by `scripts/gh-get-issue.mjs`.

## Classification rules

| Type | Signals |
|---|---|
| `bug` | Labels `bug`/`defect`/`regression`; body contains "error", "crash", "unexpected", "broken", "fix" |
| `feature` | Labels `feature`/`enhancement`/`feature-request`; body describes new behaviour or capability |
| `refactor` | Labels `refactor`/`tech-debt`/`cleanup`; body focuses on internal structure without changing behaviour |
| `security` | Labels `security`/`vulnerability`/`CVE`; body references a security concern, exploit, or hardening request |

When signals conflict, apply the highest-priority match in this order: `security` > `bug` > `refactor` > `feature`.  
If no signal matches any type, output type `feature` and set status `NEEDS_REVIEW`.

## Output

```markdown
### Status
[DONE | NEEDS_REVIEW] — one-line summary including the classified type

### Classification

**Type**: bug | feature | refactor | security
**Confidence**: high | medium | low
**Signals**: list the labels and keywords that drove the decision

### Handoff
Type: <type>
Next agent: code-builder-<type>
Pass the full issue JSON forward unchanged.
If confidence is low, surface uncertainty to the human before continuing.
```

### Status rules

- `DONE` — type determined with medium or high confidence; pipeline may continue
- `NEEDS_REVIEW` — no signals matched, or confidence is low and classification is ambiguous; halt for human decision before invoking any code-builder variant
