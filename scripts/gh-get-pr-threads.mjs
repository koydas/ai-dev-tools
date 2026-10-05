#!/usr/bin/env node
// Fetch reviewer comment threads for a GitHub PR → JSON
// Usage: node scripts/gh-get-pr-threads.mjs <pr-number> [--repo <owner/repo>]
// Node ≥ 20, requires `gh` CLI authenticated

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

export function getPrThreads(prNumber, repo) {
  const prArgs = ['pr', 'view', String(prNumber), '--json', 'reviews,reviewRequests,comments'];
  if (repo) prArgs.push('--repo', repo);
  const data = JSON.parse(execFileSync('gh', prArgs, { encoding: 'utf8' }));

  const [owner, name] = resolveRepo(repo).split('/');
  const threadsRaw = execFileSync(
    'gh',
    ['api', 'graphql', '--paginate', '--slurp',
      '-f', `query=${THREADS_QUERY}`,
      '-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `number=${prNumber}`],
    { encoding: 'utf8' }
  );

  return {
    reviews: data.reviews,
    reviewRequests: data.reviewRequests,
    prComments: data.comments,
    threads: buildThreads(JSON.parse(threadsRaw)),
  };
}

function resolveRepo(repo) {
  if (repo) return repo;
  try {
    return execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], { encoding: 'utf8' }).trim();
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
