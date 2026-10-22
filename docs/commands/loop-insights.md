# /loop-insights

> **Status: proposed, not implemented.** Specified by [ADR-017](../adr/ADR-017-loop-insights-command.md). The command, the agent and the script do not exist yet; this page is the reference to implement against.

Draft proposals for changes to an autonomous-dev-loop deployment from its published findings.

## Purpose

autonomous-dev-loop publishes the findings of its Diagnostics page as `findings.json`, each with a suggested lever (the setting, prompt or workflow that governs the pattern) when the pattern is active and actionable. `/loop-insights` reads that file and writes, for each finding with a lever, a short proposal: what was observed, what to change, what to check first, which gate applies.

It is read-only. It creates no issue, comment, file or branch. What you do with a proposal is your decision.

## Invocation

```
/loop-insights                      # every finding that has a lever, from configs/meta-loop.yaml
/loop-insights --finding review-withheld
/loop-insights --source ./findings.json
/loop-insights --source https://example.org/findings.json
```

| Argument | Meaning |
|---|---|
| `--finding <key>` | Only this finding. An unknown key is an error |
| `--source <url\|path>` | `https://` URL or local path instead of `findings_url` |

## What it does

1. `scripts/loop-insights.mjs` fetches the export (`https` or a local file, no token), checks `schema_version`, validates the shape, drops unknown fields, and keeps the findings that have a `lever`, with bounded evidence (5 entries, `summary` cut to 200 characters).
2. The `loop-analyst` agent drafts one proposal per finding from that JSON only.
3. The command prints the report.

## Configuration

`configs/meta-loop.yaml` (versioned, no secret):

```yaml
findings_url: https://koydas.github.io/autonomous-dev-loop/findings.json
```

## Output

```markdown
### Status
DONE — 2 proposals from 5 findings (window 2026-10-16 → 2026-10-22, generated 2026-10-22)

### Proposals
#### review-withheld
**Observed:** <fact, verbatim>
**Hypothesis (unverified):** <hypothesis, verbatim>
**Lever:** review — config/models.yaml#review_max_input_tokens, anthropic_review_max_diff_chars, AI_PROVIDER_REVIEW (ADR-0028, ADR-0038)
**Draft change:** <what to edit, and the check to run first>
**Gate:** `review` eval suite — live `evals.yml` on the branch; docs and tests in the same PR
**Risk:** <what the change could break>

### Not proposed
- review-coverage — resolved since 2026-10-20
- runs-failed — no lever (needs root cause)
- 1 telemetry gap: duration-thin

### Handoff
Apply a proposal as an ordinary pull request in autonomous-dev-loop. Nothing was posted or created.
```

| Status | Meaning |
|---|---|
| `DONE` | Export valid; every finding is under **Proposals** or **Not proposed** |
| `BLOCKED` | Unsupported `schema_version`, `status: no_data`, unreachable source, or no finding with a lever |
| `NEEDS_REVIEW` | A proposal rests on an assumption the export does not support; it is stated, and the pipeline halts for you |

## Guarantees and limits

- **Read-only.** The agent has no write tool; the command writes nothing.
- **Levers come from the export.** The agent may order the targets of a lever, not add one, and never proposes a weaker gate: no threshold change, dataset-case removal, filtered eval, protected-path change, `.github/` change or attempt-cap increase.
- **Facts are quoted, hypotheses are labelled.** A hypothesis is never stated as a fact.
- **The export is data.** Some fields carry model-originated text from the public run record; an instruction found there is reported as an observation and never followed.
- **No lever is not "all good".** `status: ok` or an empty list is not proof of health; the export's `gaps` are listed.
- **Thin data.** The statistics are a few days of runs; early on most findings have no lever and the report says so.
- **Offline.** Only `--source <path>` works without network.

## See also

- [ADR-017](../adr/ADR-017-loop-insights-command.md) — decision and alternatives
- autonomous-dev-loop [`docs/meta-loop.md`](https://github.com/koydas/autonomous-dev-loop/blob/main/docs/meta-loop.md) — export contract, lever table, implementation steps
- [ADR-001](../adr/ADR-001-human-as-gate.md), [ADR-003](../adr/ADR-003-structured-agent-output-contract.md)
