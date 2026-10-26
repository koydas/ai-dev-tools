### Status
DONE — the script is implemented as the AC describes and `node --test` passes. I have no blocking issues, only the non-blocking notes below.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md`, `.github/workflows/ci.yml` | PASS — 222/222 (includes the new `tests/review-chain-metrics.test.mjs`) |
| Reproduction | — | — | N/A — not a bug fix |
| Lint | — | — | N/A — the repo has no linter and no `package.json` |
| Type-check | — | — | N/A — the repo has no type-checker |

**AC coverage**
- [x] Add the `review-chain-metrics` script — `scripts/review-chain-metrics.mjs`. It follows the conventions: ESM, exported pure functions plus a CLI entrypoint using `fileURLToPath`, `execFileSync` through `gh-transport`, and `null` for unknown values.
- [x] `/pr-review` → `/pr-fixer` signals from PR history. The script extracts these signals:
  - rounds, from the parsed pr-analyst reports (`parseReport`, `buildRecord`)
  - blocking and non-blocking findings touched since each report's head SHA
  - nits
  - human threads after the first report and beyond the files it cited
  - CI on head
  - an aggregate (`aggregate`)
  - It reuses `classifyComment` and `parsePrRef`, so its trust rule matches `/pr-fixer`.
  - The report format it parses matches `agents/pr-analyst.md` (Branch line, finding lines, section titles).
- [x] Tests: the parsers, `buildRecord`, `aggregate` and the CLI argument errors are covered. The `gh`-calling `collectPr` is not unit-tested, which `CLAUDE.md` allows for scripts that shell out to `gh`.
- [x] The README script table has a new row.

**Bugs / regressions**
- No regressions found.
- `scripts/review-chain-metrics.mjs:35` and `:84` — `parseReport` throws when a comment passes `classifyComment` as a `pr-review` but its Status line is not literally `DONE`, `NEEDS_REVIEW` or `BLOCKED`, for example `**DONE**`. `buildRecord` does not catch the throw, so one odd comment aborts the whole multi-PR run with exit 1. `collectPr` already tolerates this case when it collects SHAs. Low likelihood.

**Scope violations**
- None. The change touches only the script, its test and the README.

**Missing tests**
- Scenario: a `pr-review`-classified body with a non-standard Status makes `buildRecord` throw. No test covers it.

**Blocking issues** (must fix before merge)
- None.

**Non-blocking notes**
- Handle a malformed report in `buildRecord` (skip it, or treat the round as unknown) so one bad comment doesn't kill a batch, and add a test.
- `.claude-plugin/plugin.json` is still at `0.4.1`. `CLAUDE.md` says to bump the version when a change to `scripts/` must reach plugin installs. Bump it if this script should ship in the plugin.
- `scripts/review-chain-metrics.mjs:187` — `--recent` lists PRs with one non-paginated page. This is deliberate and documented, with the 1..100 bound. It is still a small departure from the `--paginate` convention.
- The GitHub compare API caps `files` at 300 entries. On a very large PR the "touched" counts can be undercounted without any signal. `nit`: say so in the header comment.
- The evidence-row parser reads the Result column as the fifth `|`-split cell. A command containing a literal `|` shifts the columns and the row goes uncounted. `nit`.

### Handoff
Ready for human review and merge. If the maintainers want the script in plugin installs, bump the plugin version first. `/pr-fixer` can apply the non-blocking notes.
