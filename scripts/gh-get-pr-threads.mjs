#!/usr/bin/env node
// Fetch reviewer comment threads for a GitHub PR → JSON
// Usage: node scripts/gh-get-pr-threads.mjs <pr-number> [--repo <owner/repo>]
// Node ≥ 20, requires `gh` CLI authenticated

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ghApi, repoPath, toAuthor, toPr } from './gh-rest.mjs';

// The REST endpoint `pulls/{n}/comments` carries no resolution state; only the GraphQL
// `reviewThreads` connection exposes `isResolved` / `isOutdated`. Replies beyond the first 100
// of a single thread are not fetched. Where GraphQL is refused (e.g. Claude Code cloud sessions),
// threads are rebuilt from REST review comments — see buildRestThreads.
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

// Pure: REST review comments (`pulls/{n}/comments`) → threads, same shape as buildThreads.
// `states` maps a root comment id → { resolved, outdated } when a resolution source is available;
// without one, `resolved` is null (unknown — treat as unresolved) and `outdated` comes from REST
// (`line` is null once the commented line no longer exists). threadId is null: no GraphQL node id.
export function buildRestThreads(comments, states = null) {
  if (!Array.isArray(comments)) throw new Error('expected an array of review comments');
  const replies = new Map();
  for (const c of comments) {
    if (c.in_reply_to_id == null) continue;
    if (!replies.has(c.in_reply_to_id)) replies.set(c.in_reply_to_id, []);
    replies.get(c.in_reply_to_id).push(c);
  }
  return comments
    .filter((c) => c.in_reply_to_id == null)
    .map((root) => {
      const state = states?.get(root.id);
      return {
        id: root.id,
        threadId: null,
        path: root.path,
        line: root.line ?? root.original_line ?? null,
        author: toAuthor(root.user)?.login ?? null,
        body: root.body,
        createdAt: root.created_at,
        resolved: state ? state.resolved === true : null,
        outdated: state ? state.outdated === true : root.line == null,
        replies: (replies.get(root.id) ?? [])
          .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
          .map((r) => ({ author: toAuthor(r.user)?.login ?? null, body: r.body, createdAt: r.created_at })),
      };
    });
}

// Pure: Claude Code cloud sessions' `pulls/{n}/ccr/review_threads` → Map(root comment id → state).
export function buildThreadStates(ccrThreads) {
  if (!Array.isArray(ccrThreads)) throw new Error('expected an array of review threads');
  return new Map(ccrThreads.filter((t) => t?.comment_ids?.length).map((t) => [t.comment_ids[0], { resolved: t.resolved, outdated: t.outdated }]));
}

function getGraphqlThreads(prNumber, repo) {
  const [owner, name] = resolveRepo(repo).split('/');
  const threadsRaw = execFileSync(
    'gh',
    ['api', 'graphql', '--paginate', '--slurp',
      '-f', `query=${THREADS_QUERY}`,
      '-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `number=${prNumber}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return buildThreads(JSON.parse(threadsRaw));
}

function getRestThreads(prNumber, repo) {
  const base = `${repoPath(repo)}/pulls/${prNumber}`;
  const comments = ghApi(`${base}/comments?per_page=100`, { paginate: true });
  let states = null;
  try {
    states = buildThreadStates(ghApi(`${base}/ccr/review_threads`));
  } catch {
    // No resolution source outside Claude Code cloud sessions: resolved stays null.
  }
  return buildRestThreads(comments, states);
}

// Reviews, review requests and PR comments over REST (gh pr view is GraphQL); threads over
// GraphQL when available, else rebuilt from REST.
export function getPrThreads(prNumber, repo) {
  const base = repoPath(repo);
  const { reviews, reviewRequests, comments: prComments } = toPr(ghApi(`${base}/pulls/${prNumber}`), {
    reviews: ghApi(`${base}/pulls/${prNumber}/reviews?per_page=100`, { paginate: true }),
    comments: ghApi(`${base}/issues/${prNumber}/comments?per_page=100`, { paginate: true }),
  });

  let threads;
  try {
    threads = getGraphqlThreads(prNumber, repo);
  } catch {
    threads = getRestThreads(prNumber, repo);
  }

  return {
    reviews,
    reviewRequests,
    prComments,
    threads,
  };
}

function resolveRepo(repo) {
  if (repo) return repo;
  try {
    return ghApi(repoPath()).full_name;
  } catch {
    throw new Error('Could not determine repository. Pass --repo <owner/repo>.');
  }
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
