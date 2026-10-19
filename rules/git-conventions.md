# git-conventions

Commit format, branching strategy, and merge rules that apply to all repositories in this workspace.

## Commit format

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

**Types**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`

**Subject**: imperative mood, lowercase, no trailing period, ≤ 72 characters
- Good: `feat(auth): add refresh token rotation`
- Bad: `Added refresh token`, `Fixed the bug.`

**Scope**: the module or directory name — optional but preferred for multi-module repos

**Body**: explain *why*, not *what* — the diff already shows what changed

**Footer**: reference issues (`Closes #42`, `Refs #17`) and breaking changes (`BREAKING CHANGE: <description>`)

## Branching strategy

| Branch | Purpose | Merge target |
|--------|---------|--------------|
| `main` | Stable, deployable | — |
| `feat/<ticket>-<slug>` | New feature from issue | `main` via PR |
| `fix/<ticket>-<slug>` | Bug fix | `main` via PR |
| `chore/<slug>` | Tooling, CI, deps | `main` via PR |
| `docs/<slug>` | Documentation only | `main` via PR |

**Never commit directly to `main`**. All changes go through PRs.

## Merge rules

- Squash merge for feature branches — keeps `main` history linear
- Merge commit for release branches — preserves release boundary
- No force-push to `main` or shared branches
- Delete the branch after merging

## Tags and releases

- Semantic versioning: `v<major>.<minor>.<patch>`
- Tag on `main` after merging a release PR
- Annotated tags only: `git tag -a v1.2.0 -m "Release v1.2.0"`
