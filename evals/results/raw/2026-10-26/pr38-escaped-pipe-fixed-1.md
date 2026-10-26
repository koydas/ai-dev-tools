### Status
NEEDS_REVIEW — the script and its tests work, but one malformed report comment makes the whole run fail.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md` | PASS — 227/227 (includes the new `tests/review-chain-metrics.test.mjs`) |
| Reproduction | — | — | N/A — not a bug fix |
| Lint | — | — | N/A — no linter documented in `CLAUDE.md` |
| Type-check | — | — | N/A — plain ESM, no type-checker |
| Network paths (`collectPr`, CLI fetch) | — | — | NOT_RUN — no network or authenticated `gh`; per `CLAUDE.md`, `gh`-backed paths are not unit-tested |

The AC is a single line, so I read it as "a script that extracts /pr-review → /pr-fixer chain metrics from PR history".

**AC coverage**
- [x] The script exists with a CLI entrypoint and exported pure functions. They compute rounds, blocking and non-blocking findings touched since each report, human threads beyond the review, CI on head, and aggregates (`scripts/review-chain-metrics.mjs:38-150`).
- [x] The script gets its data from PR history over REST, using `--paginate` via `restList`, and unknown values are `null` (`collectPr`, `:150-185`).
- [x] The pure logic has tests, and the README scripts table has a row for it.

**Bugs / regressions**
- `scripts/review-chain-metrics.mjs:70` — `buildRecord` calls `parseReport(c.body)` without a guard. `classifyComment` marks a comment as `pr-review` when it has a `### Status` heading, a `### Review` heading and `**Evidence**`. `parseReport` also requires a Status value of DONE, NEEDS_REVIEW or BLOCKED. A trusted comment that has the headings but another Status value, such as `STUCK`, makes `parseReport` throw "report has no ### Status line". I reproduced this. The exception escapes `collectPr`, and the CLI catch exits 1, so one odd comment aborts the whole batch and no JSON is emitted. `collectPr` already guards the same call when it collects SHAs, so this call is inconsistent with it.
- `scripts/review-chain-metrics.mjs:196-200` — with `--recent`, positional PR refs are silently dropped, and a `--repo` given in a ref is dropped as well. This is a minor surprise.

**Scope violations**
- None.

**Missing tests**
- Scenario: a malformed or unparsable report comment inside `buildRecord` should be skipped or counted as unknown, not throw.
- Scenario: `--recent` combined with positional refs.

**Blocking issues** (must fix before merge)
1. Make `buildRecord` tolerate a `pr-review`-classified comment that `parseReport` rejects (skip it, or record it as unparsed), and add a test for it.

**Non-blocking notes**
- Bump `version` in `.claude-plugin/plugin.json` (currently 0.4.1). `CLAUDE.md` asks for this when a change to `scripts/` must reach plugin installs, and this PR doesn't touch it.
- `nit`: reject, or document, `--recent` together with positional refs.
- `nit`: "touched" is computed from the net diff between the report head and the PR head. A file that was changed and then reverted counts as untouched. The header comment already says these are proxies.

### Handoff
NEEDS_REVIEW: pass blocking issue 1 to /pr-fixer or back to code-builder. /pr-fixer can also apply the non-blocking notes.
