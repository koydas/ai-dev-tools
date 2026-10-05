#!/usr/bin/env node
// Fetch reviewer comment threads for a GitHub PR → JSON
// Usage: node scripts/gh-get-pr-threads.mjs <pr-number> [--repo <owner/repo>]
// Node ≥ 20, requires `gh` CLI authenticated
// Transport: GraphQL first. When it fails (e.g. a Claude Code cloud session, whose proxy refuses
// GraphQL), everything is fetched over REST; resolution state then comes from the session's
// `pulls/{n}/ccr/review_threads` route when it exists, else it is reported unknown (`null`).
// The output's `source` says which: `graphql` | `rest+ccr` | `rest`. Pattern: ADR-011.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The REST endpoint `pulls/{n}/comments` carries no resolution state; only the GraphQL
// `reviewThreads` connection exposes `isResolved` / `isOutdated`. Replies beyond the first 100
// of a single thread are not fetched.
const THREADS_QUERY = `
query($owner: String!, $name: String!, $number: Int!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $endCursor) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          originalLine
          comments(first: 100) {
            nodes { databaseId author { login } body createdAt }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

// Pure: `gh api graphql --paginate --slurp` output (an array of pages) → threads.
export function buildThreads(pages) {
  if (!Array.isArray(pages)) throw new Error('expected an array of GraphQL pages');
  return pages.flatMap((page, i) => {
    const connection = page?.data?.repository?.pullRequest?.reviewThreads;
    if (!connection || !Array.isArray(connection.nodes)) {
      throw new Error(`GraphQL page ${i + 1} has no reviewThreads`);
    }
    return connection.nodes
      .filter((thread) => thread?.comments?.nodes?.length)
      .map((thread) => {
        const [root, ...replies] = thread.comments.nodes;
        return {
          id: root.databaseId,
          threadId: thread.id,
          path: thread.path,
          line: thread.line ?? thread.originalLine,
          author: root.author?.login ?? null,
          body: root.body,
          createdAt: root.createdAt,
          resolved: thread.isResolved === true,
          outdated: thread.isOutdated === true,
          replies: replies.map((r) => ({ author: r.author?.login ?? null, body: r.body, createdAt: r.createdAt })),
        };
      });
  });
}

// Pure: REST review comments (+ optional ccr review_threads) → threads, same shape as buildThreads.
// Without ccr data, `resolved` is null (unknown) — never false, which would claim a settled thread
// is still open.
export function buildThreadsFromRest(comments, ccrThreads = null) {
  if (!Array.isArray(comments)) throw new Error('expected an array of review comments');
  const byId = new Map(comments.map((c) => [c.id, c]));
  const thread = (root, replies, meta) => ({
    id: root.id,
    threadId: null,
    path: root.path,
    line: meta.line ?? root.line ?? root.original_line,
    author: root.user?.login ?? null,
    body: root.body,
    createdAt: root.created_at,
    resolved: meta.resolved,
    outdated: meta.outdated,
    replies: replies.map((r) => ({ author: r.user?.login ?? null, body: r.body, createdAt: r.created_at })),
  });

  const threads = [];
  const seen = new Set();
  if (Array.isArray(ccrThreads)) {
    for (const t of ccrThreads) {
      const members = (t?.comment_ids ?? []).map((id) => byId.get(id)).filter(Boolean);
      if (!members.length) continue;
      members.forEach((c) => seen.add(c.id));
      const [root, ...replies] = members;
      threads.push(thread(root, replies, {
        line: t.line, resolved: typeof t.resolved === 'boolean' ? t.resolved : null, outdated: t.outdated === true,
      }));
    }
  }
  // Comments no ccr thread covers (or no ccr data at all): group replies under their root.
  const rest = comments.filter((c) => !seen.has(c.id));
  for (const root of rest.filter((c) => !c.in_reply_to_id)) {
    const replies = rest.filter((c) => c.in_reply_to_id === root.id);
    threads.push(thread(root, replies, { line: null, resolved: null, outdated: root.line == null }));
  }
  return threads;
}

// Pure: REST reviews / requested_reviewers / issue comments → the `gh pr view --json` field shapes.
export function mapRestPrActivity({ reviews = [], requested = {}, issueComments = [] } = {}) {
  return {
    reviews: reviews.map((r) => ({
      id: r.node_id, author: { login: r.user?.login ?? null }, body: r.body,
      state: r.state, submittedAt: r.submitted_at, commit: { oid: r.commit_id },
    })),
    reviewRequests: [
      ...(requested.users ?? []).map((u) => ({ __typename: 'User', login: u.login })),
      ...(requested.teams ?? []).map((t) => ({ __typename: 'Team', name: t.name, slug: t.slug })),
    ],
    prComments: issueComments.map((c) => ({
      id: c.node_id, author: { login: c.user?.login ?? null }, body: c.body,
      createdAt: c.created_at, url: c.html_url,
    })),
  };
}

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const restList = (endpoint) => JSON.parse(gh(['api', '--paginate', '--slurp', endpoint])).flat();

function getPrThreadsGraphql(prNumber, ownerRepo) {
  const data = JSON.parse(gh(['pr', 'view', String(prNumber), '--json', 'reviews,reviewRequests,comments', '--repo', ownerRepo]));
  const [owner, name] = ownerRepo.split('/');
  const threadsRaw = gh(['api', 'graphql', '--paginate', '--slurp',
    '-f', `query=${THREADS_QUERY}`,
    '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${prNumber}`]);
  return {
    source: 'graphql',
    reviews: data.reviews,
    reviewRequests: data.reviewRequests,
    prComments: data.comments,
    threads: buildThreads(JSON.parse(threadsRaw)),
  };
}

function getPrThreadsRest(prNumber, ownerRepo) {
  const base = `repos/${ownerRepo}`;
  let ccrThreads = null;
  try {
    ccrThreads = restList(`${base}/pulls/${prNumber}/ccr/review_threads`);
  } catch { /* route only exists behind the Claude Code session proxy */ }
  return {
    source: ccrThreads ? 'rest+ccr' : 'rest',
    ...mapRestPrActivity({
      reviews: restList(`${base}/pulls/${prNumber}/reviews`),
      requested: JSON.parse(gh(['api', '--paginate', `${base}/pulls/${prNumber}/requested_reviewers`])),
      issueComments: restList(`${base}/issues/${prNumber}/comments`),
    }),
    threads: buildThreadsFromRest(restList(`${base}/pulls/${prNumber}/comments`), ccrThreads),
  };
}

export function getPrThreads(prNumber, repo) {
  const ownerRepo = resolveRepo(repo);
  try {
    return getPrThreadsGraphql(prNumber, ownerRepo);
  } catch (err) {
    const reason = String(err.stderr || err.message).split('\n')[0].slice(0, 120);
    console.error(`GraphQL unavailable (${reason}) — falling back to REST`);
    return getPrThreadsRest(prNumber, ownerRepo);
  }
}

// Pure: owner/repo from a GitHub remote URL (https or ssh), null otherwise.
export function repoFromRemoteUrl(url) {
  const m = String(url ?? '').trim().match(/github\.com[/:]([A-Za-z0-9-]+\/[A-Za-z0-9._-]+?)(?:\.git)?\/?$/);
  return m ? m[1] : null;
}

function resolveRepo(repo) {
  if (repo) return repo;
  try {
    return gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).trim();
  } catch { /* gh repo view uses GraphQL: fall back to the origin remote */ }
  let fromRemote = null;
  try {
    fromRemote = repoFromRemoteUrl(execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch { /* not a git clone */ }
  if (!fromRemote) throw new Error('Could not determine repository. Pass --repo <owner/repo>.');
  return fromRemote;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const number = args.find(a => /^\d+$/.test(a));
  const repoIdx = args.indexOf('--repo');
  const repo = repoIdx !== -1 ? args[repoIdx + 1] : undefined;

  if (!number) {
    console.error('Usage: node scripts/gh-get-pr-threads.mjs <pr-number> [--repo <owner/repo>]');
    process.exit(1);
  }

  try {
    const threads = getPrThreads(number, repo);
    console.log(JSON.stringify(threads, null, 2));
  } catch (err) {
    console.error(`Error fetching threads for PR #${number}:`, err.message);
    process.exit(1);
  }
}
