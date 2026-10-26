### Status
DONE — the script matches the `pr-analyst` report format and the full suite passes. I found no blocking issues, only two non-blocking robustness notes.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md` (Tests) | PASS — 221/221, including the new `tests/review-chain-metrics.test.mjs` |
| Lint | — | — | N/A — no linter configured |
| Type-check | — | — | N/A — no type-checker configured |
| Builder evidence | — | — | N/A — none supplied |

**AC coverage**
- [x] Add the review-chain-metrics script, with signals derived from PR history, in `scripts/review-chain-metrics.mjs`.
  - It reports rounds, findings touched since the report, human threads beyond the review, and CI on head.
  - `parseReport` and `parseFinding` match the `agents/pr-analyst.md` format: the `**Branch**: … @ sha` line, `**[Sev · origin]**` findings, and the Evidence result values.
  - Reuses `classifyComment` and `parsePrRef`, so its trust rule is the same as `/pr-fixer`'s.
- [x] Repo conventions are followed:
  - ESM, with the CLI entrypoint guarded by `fileURLToPath`.
  - It shells out through `execFileSync` via `gh`, and list calls are paginated.
  - Fields the history can't provide are `null`.
  - `tests/review-chain-metrics.test.mjs` is added and the README scripts table is updated.

**Bugs / regressions**
- None blocking.

**Scope violations**
- None. The change touches only the new script, its test and a README row.

**Missing tests**
- `collectPr` and the `--recent` happy path need an authenticated `gh`, so they are not unit-tested. That is consistent with the repo convention.

**Blocking issues**
- None.

**Non-blocking notes**
- `scripts/review-chain-metrics.mjs`, `buildRecord`: it calls `parseReport` without a guard.
  - A trusted comment that passes `classifyComment` as a report but has an unparseable Status line throws.
  - That aborts the whole run, including every other PR in it.
  - `collectPr` already wraps the same call in try/catch. Skipping or flagging the malformed report would be more consistent.
- `scripts/review-chain-metrics.mjs`, CLI: when `--recent` is given, positional PR refs are silently discarded. Either reject the combination or merge the two.
- `scripts/review-chain-metrics.mjs`, `--recent`: the listing is `state=closed`, so closed-unmerged PRs are included. Their `time_to_merge_h` is `null`, which is correct, but the help text could say so (nit).
- `docs/commands/` has no entry for the script, which matches the rule that only commands need one. `.claude-plugin/plugin.json` also needs a version bump if the script should reach plugin installs, per `CLAUDE.md`.

### Handoff
DONE: ready for human review and merge. The non-blocking notes can go to `/pr-fixer`.
