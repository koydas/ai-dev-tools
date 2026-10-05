#!/usr/bin/env node
// Fetch a GitHub PR by number or head branch → JSON
// Usage: node scripts/gh-get-pr.mjs [<pr-ref> | --branch <branch>] [--repo <owner/repo>]
//   <pr-ref>: 42 | #42 | owner/repo#42 | https://github.com/owner/repo/pull/42[/...]
// Output adds `repository` (owner/repo), so commands can pass --repo to the other scripts.
// Node ≥ 20, requires `gh` CLI authenticated

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ghApi, repoPath, toPr } from './gh-rest.mjs';

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

// Pure: the PR to pick among the REST results for a head branch — an open one first, else the most recent.
export function pickPrForBranch(prs, branch) {
  if (!Array.isArray(prs) || prs.length === 0) throw new Error(`no pull requests found for branch "${branch}"`);
  return prs.find((p) => p.state === 'open') ?? [...prs].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
}

// REST, not `gh pr view` (GraphQL) — see scripts/gh-rest.mjs. Same JSON fields as `gh pr view --json`.
export function getPr(identifier, repo) {
  const base = repoPath(repo);
  let number = String(identifier);
  if (!/^\d+$/.test(number)) {
    const owner = repo ? repo.split('/')[0] : '{owner}';
    // `{owner}` stays unencoded: gh api substitutes it only verbatim.
    const head = `${owner}:${encodeURIComponent(number)}`;
    number = pickPrForBranch(ghApi(`${base}/pulls?head=${head}&state=all&per_page=100`), number).number;
  }
  const pr = ghApi(`${base}/pulls/${number}`);
  return toPr(pr, {
    reviews: ghApi(`${base}/pulls/${number}/reviews?per_page=100`, { paginate: true }),
    comments: ghApi(`${base}/issues/${number}/comments?per_page=100`, { paginate: true }),
  });
}

// `gh pr diff` uses REST already.
export function getPrDiff(prNumber, repo) {
  const args = ['pr', 'diff', String(prNumber)];
  if (repo) args.push('--repo', repo);
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const branchIdx = args.indexOf('--branch');
  const repoIdx = args.indexOf('--repo');
  const repo = repoIdx !== -1 ? args[repoIdx + 1] : undefined;

  let identifier;
  let targetRepo = repo;
  // An empty argument (e.g. an empty quoted "$ARGUMENTS") means no PR ref: fall back to the current branch.
  const positional = args.filter((a, i) => a.trim() !== '' && !a.startsWith('--') && args[i - 1] !== '--branch' && args[i - 1] !== '--repo');
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
