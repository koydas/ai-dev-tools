# /check-releases

List repositories where `main` has commits not yet included in a release tag.

## Steps

1. Run the release check script: `node scripts/check-releases.mjs`
   - The script reads configured repositories and for each one checks whether HEAD on `main` is reachable from the latest release tag
2. Present the results:
   - Repos with unreleased commits: repo name, latest tag, number of commits ahead, first commit message
   - Repos up to date: listed briefly
3. For each repo with unreleased commits, offer to:
   - Show the full list of unreleased commits
   - Draft release notes from the commit messages
