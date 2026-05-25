# /check-releases

List repositories where `main` has commits not yet included in a release tag.

## Purpose

A quick hygiene check across your configured repos: which ones have shipped code sitting on `main` without a corresponding release tag?

## Invocation

```
/check-releases
```

No arguments. Reads the list of repositories from the workspace configuration.

## What it does

1. Runs `node scripts/check-releases.mjs` against all configured repos
2. For each repo, checks whether HEAD on `main` is reachable from the latest semver tag
3. Reports repos with unreleased commits and offers to draft release notes

## Output

```
Unreleased changes:

  api-gateway      v1.4.2 → main (+5 commits)  feat(auth): add refresh token rotation ...
  frontend-app     v2.1.0 → main (+12 commits)  feat(ui): add dark mode ...

Up to date:

  shared-lib       v0.8.1  ✓
  infra            v3.0.0  ✓
```

For each repo with unreleased commits, you can:
- View the full commit list
- Generate release notes from the commit messages

## See also

- [`scripts/check-releases.mjs`](../../scripts/check-releases.mjs) — the script this command delegates to
- [`skills/git-conventions.md`](../../skills/git-conventions.md) — tagging conventions
