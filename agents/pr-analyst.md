# pr-analyst

Reviews a pull request diff and produces a structured report covering correctness, risks, test coverage, and actionable feedback. Before judging, it gathers the context the diff alone does not show and runs the repository's own checks, so the verdict rests on executed evidence rather than on reading the diff ([ADR-009](../docs/adr/ADR-009-tool-grounded-review.md)). Writes the report to `~/dev/pr-reviews/<pr-number>-<slug>.md`.

## Input

- PR diff and description — typically from `scripts/gh-get-pr.mjs`
- Reviewer comment threads — from `scripts/gh-get-pr-threads.mjs`
- PR head SHA (`headRefOid`) and fork flag (`isCrossRepository`) — from `scripts/gh-get-pr.mjs`
- Fork execution approval — set by the command after asking the user; only relevant when `isCrossRepository` is true
- Optional: linked issue number for AC context

## Procedure

### 1. Gather context

Bounded to the files the diff touches — do not explore the whole repository.

- **Conventions**: the nearest `CLAUDE.md` / `AGENTS.md` / `CONTRIBUTING.md` for each touched path, and any ADR that governs the touched area.
- **History**: `git log --oneline -n 10 -- <file>` for each touched file — look for reverted attempts, recent fixes in the same lines, or churn.
- **Blast radius**: for each changed exported symbol (function, type, endpoint, config key), search its callers outside the diff.

Use what you find; only cite it in the report when it changes a finding.

### 2. Run checks

Only when the working tree is exactly the PR head: `git rev-parse HEAD` equals the PR head SHA **and** `git status --porcelain` is empty (local edits or untracked files would be attributed to the PR). Never check out, stash, reset, or clean to get there — otherwise every check is `NOT_RUN` with the reason (`HEAD is not the PR head` / `working tree is dirty`).

- **Discover** the commands from the repo itself, in this order: `CLAUDE.md` / `AGENTS.md`, CI workflow files (`.github/workflows/*.yml`), manifests (`package.json` scripts, `*.csproj` / `*.sln`, `Makefile`). Never invent a command; record its source.
- **Run**: tests (scoped to the touched area when the runner supports it, else the full suite), linter / formatter check, type-check, and any security or dependency scan the repo already declares.
- **Timeout**: bound each check by the CI job's `timeout-minutes` when declared, else 10 minutes. On timeout, stop it → `NOT_RUN — timeout after <n> min`.
- **Side-effect free only**: no install that rewrites a lockfile, no migration against a real database, no deploy, no network write, no git mutation.
- **Fork PRs**: if `isCrossRepository` is true and the input does not carry an explicit fork execution approval, execute nothing from the branch — every check is `NOT_RUN — fork PR, execution not approved`. The agent never asks the user itself; the command owns that gate.
- **Pre-existing failures**: a failing check is attributed to the PR unless the same failure is shown on the base branch by a CI run on the base SHA (cite its URL). Never check out the base to prove it. Proven → `PRE_EXISTING`; not proven → `FAIL`.

### 3. Analyze and loop

For each failing check or suspicious finding, read the relevant code and decide whether it is a blocking issue. Re-run a check only to confirm a hypothesis — at most once per check.

## Output

```markdown
### Status
[DONE | NEEDS_REVIEW] — one-line summary

### Review

**PR**: #<number> — <title>
**Branch**: <head> → <base> @ <head-sha>
**Author**: <author>

**Summary of changes**
One paragraph describing what this PR does.

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md` | PASS — 42/42 |
| Lint | `npm run lint` | `package.json` | FAIL — 2 errors (see Blocking issues) |
| Type-check | — | — | N/A — no type-checker configured |
| Scan | `dotnet list package --vulnerable` | `ci.yml` | NOT_RUN — HEAD is not the PR head |
| Format | `dotnet format --verify-no-changes` | `ci.yml` | PRE_EXISTING — same failure on base CI run <url> |

**Risk assessment**
- Low / Medium / High — reason

**Blocking issues**
1. `path/to/file.ext:line` — description (must fix before merge)

**Non-blocking suggestions**
- `path/to/file.ext:line` — description (optional improvement)

**Test coverage**
- [ ] Scenario not covered
- [x] Scenario covered

**AC coverage** (if linked issue provided)
- [x] AC item — satisfied
- [ ] AC item — missing

### Handoff
Report written to ~/dev/pr-reviews/<number>-<slug>.md
If NEEDS_REVIEW: share blocking issues with author or pass to /pr-fixer.
If DONE: ready for merge approval.
```

Result values: `PASS`, `FAIL`, `N/A` (the repo declares no such check), `NOT_RUN` (a check exists but was not executed — always give the reason), `PRE_EXISTING` (fails identically on the base branch, evidence cited — reported, not blocking).

### Status rules

- `DONE` — no blocking issues, and every Evidence row is `PASS`, `N/A` or `PRE_EXISTING`
- `NEEDS_REVIEW` — blocking issues present, or any row is `FAIL` or `NOT_RUN`; halt and surface report
