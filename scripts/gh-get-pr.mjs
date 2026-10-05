#!/usr/bin/env node
// Fetch a GitHub PR by number or head branch → JSON
// Usage: node scripts/gh-get-pr.mjs [<pr-ref> | --branch <branch>] [--repo <owner/repo>]
//   <pr-ref>: 42 | #42 | owner/repo#42 | https://github.com/owner/repo/pull/42[/...]
// Output adds `repository` (owner/repo), so commands can pass --repo to the other scripts.
// Node ≥ 20, requires `gh` CLI authenticated
// Transport: `gh pr view` (GraphQL) first, REST when it fails (ADR-011); the output's `source`
// says which (`graphql` | `rest`).

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gh, restList, withGraphqlFallback, resolveRepo, mapRestPrActivity } from './gh-transport.mjs';

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

// Pure: REST `pulls/{n}` object (or the GitHub MCP `pull_request_read` `get` response, which is the
// same object with empty fields omitted) + its reviews and issue comments → the `gh pr view --json
// FIELDS` shape. A deleted head repository (fork) counts as cross-repository, so the fork gate still
// asks. Data the input does not carry is null (unknown), never an empty default (ADR-011):
// reviews / comments not passed, `assignees` / `requested_reviewers` keys absent. Labels are the
// exception: the MCP response omits the key when a PR has none (observed on real responses), so an
// absent `labels` is an empty list.
export function mapRestPr(pr, { reviews, issueComments } = {}) {
  if (!pr || typeof pr !== 'object' || !Number.isInteger(pr.number)) {
    throw new Error('not a pull request object: missing integer "number"');
  }
  const headRepo = pr.head?.repo?.full_name ?? null;
  const baseRepo = pr.base?.repo?.full_name ?? null;
  const merged = pr.merged === true || Boolean(pr.merged_at);
  const activity = mapRestPrActivity({
    reviews: reviews ?? [],
    requested: { users: pr.requested_reviewers ?? [], teams: pr.requested_teams ?? [] },
    issueComments: issueComments ?? [],
  });
  return {
    number: pr.number,
    title: pr.title ?? '',
    body: pr.body ?? '',
    state: merged ? 'MERGED' : String(pr.state ?? '').toUpperCase() || null,
    author: { login: pr.user?.login ?? null },
    headRefName: pr.head?.ref ?? null,
    headRefOid: pr.head?.sha ?? null,
    baseRefName: pr.base?.ref ?? null,
    isCrossRepository: !headRepo || !baseRepo || headRepo.toLowerCase() !== baseRepo.toLowerCase(),
    labels: (pr.labels ?? []).map((l) => ({ name: typeof l === 'string' ? l : l?.name ?? null })),
    assignees: pr.assignees === undefined ? null : pr.assignees.map((a) => ({ login: a?.login ?? null })),
    reviewRequests: pr.requested_reviewers === undefined ? null : activity.reviewRequests,
    reviews: reviews === undefined ? null : activity.reviews,
    comments: issueComments === undefined ? null : activity.prComments,
    url: pr.html_url ?? null,
    createdAt: pr.created_at ?? null,
    updatedAt: pr.updated_at ?? null,
    mergedAt: pr.merged_at ?? null,
    isDraft: pr.draft === true,
  };
}

function getPrRest(identifier, ownerRepo) {
  const base = `repos/${ownerRepo}`;
  let pr;
  if (/^\d+$/.test(String(identifier))) {
    pr = JSON.parse(gh(['api', '--paginate', `${base}/pulls/${identifier}`]));
  } else {
    // Same lookup as `gh pr view <branch>`: the open PR whose head is that branch of this repository.
    const owner = ownerRepo.split('/')[0];
    [pr] = restList(`${base}/pulls?state=open&head=${encodeURIComponent(`${owner}:${identifier}`)}`);
    if (!pr) throw new Error(`no open pull requests found for branch "${identifier}"`);
  }
  return {
    source: 'rest',
    ...mapRestPr(pr, {
      reviews: restList(`${base}/pulls/${pr.number}/reviews`),
      issueComments: restList(`${base}/issues/${pr.number}/comments`),
    }),
  };
}

export function getPr(identifier, repo) {
  // PR number or branch name — gh pr view accepts both positionally
  const args = ['pr', 'view', '--json', FIELDS, String(identifier)];
  if (repo) args.push('--repo', repo);
  return withGraphqlFallback(
    () => ({ source: 'graphql', ...JSON.parse(gh(args)) }),
    () => getPrRest(identifier, resolveRepo(repo)),
  );
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
