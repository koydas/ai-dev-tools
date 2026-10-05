#!/usr/bin/env node
// Fetch a GitHub PR by number or head branch → JSON
// Usage: node scripts/gh-get-pr.mjs [<pr-ref> | --branch <branch>] [--repo <owner/repo>]
//   <pr-ref>: 42 | #42 | owner/repo#42 | https://github.com/owner/repo/pull/42[/...]
// Output adds `repository` (owner/repo), so commands can pass --repo to the other scripts.
// Node ≥ 20, requires `gh` CLI authenticated

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const USAGE = 'Usage: node scripts/gh-get-pr.mjs [<pr-ref> | --branch <branch>] [--repo <owner/repo>]';
const REPO = '[A-Za-z0-9-]+/[A-Za-z0-9._-]+';
const PR_REF_PATTERNS = [
  [/^#?(\d+)$/, (m) => ({ number: Number(m[1]), repo: undefined })],
  [new RegExp(`^(${REPO})#(\\d+)$`), (m) => ({ number: Number(m[2]), repo: m[1] })],
  [new RegExp(`^https://github\\.com/(${REPO})/pull/(\\d+)(?:[/?#].*)?$`), (m) => ({ number: Number(m[2]), repo: m[1] })],
];

// Pure: a PR reference → { number, repo }; repo is undefined for a bare number. Throws otherwise.
export function parsePrRef(ref) {
  const value = String(ref ?? '').trim();
  for (const [pattern, build] of PR_REF_PATTERNS) {
    const m = value.match(pattern);
    if (m) return build(m);
  }
  throw new Error(`not a PR reference: ${value || '(empty)'}`);
}

// Pure: owner/repo from a PR html url.
export function repoFromPrUrl(url) {
  const m = String(url ?? '').match(new RegExp(`^https://github\\.com/(${REPO})/pull/\\d+`));
  return m ? m[1] : null;
}

const FIELDS = 'number,title,body,state,author,headRefName,headRefOid,baseRefName,isCrossRepository,labels,assignees,reviewRequests,reviews,comments,url,createdAt,updatedAt,mergedAt,isDraft';

export function getPr(identifier, repo) {
  // PR number or branch name — gh pr view accepts both positionally
  const args = ['pr', 'view', '--json', FIELDS, String(identifier)];
  if (repo) args.push('--repo', repo);
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }));
}

export function getPrDiff(prNumber, repo) {
  const args = ['pr', 'diff', String(prNumber)];
  if (repo) args.push('--repo', repo);
  return execFileSync('gh', args, { encoding: 'utf8' });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const branchIdx = args.indexOf('--branch');
  const repoIdx = args.indexOf('--repo');
  const repo = repoIdx !== -1 ? args[repoIdx + 1] : undefined;

  let identifier;
  let targetRepo = repo;
  const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--branch' && args[i - 1] !== '--repo');
  if (branchIdx !== -1) {
    identifier = args[branchIdx + 1];
  } else if (positional.length) {
    try {
      const ref = parsePrRef(positional[0]);
      identifier = ref.number;
      if (ref.repo && repo && ref.repo.toLowerCase() !== repo.toLowerCase()) {
        throw new Error(`${positional[0]} conflicts with --repo ${repo}`);
      }
      targetRepo = ref.repo ?? repo;
    } catch (err) {
      console.error(`${err.message}\n${USAGE}`);
      process.exit(1);
    }
  }

  if (!identifier) {
    // Try current branch
    try {
      identifier = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
      console.error(USAGE);
      process.exit(1);
    }
  }

  try {
    const pr = getPr(identifier, targetRepo);
    console.log(JSON.stringify({ ...pr, repository: targetRepo ?? repoFromPrUrl(pr.url) }, null, 2));
  } catch (err) {
    console.error(`Error fetching PR for "${identifier}":`, err.message);
    process.exit(1);
  }
}
