#!/usr/bin/env node
// Fetch reviewer comment threads for a GitHub PR → JSON
// Usage: node scripts/gh-get-pr-threads.mjs <pr-number> [--repo <owner/repo>]
// Node ≥ 20, requires `gh` CLI authenticated

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function getPrThreads(prNumber, repo) {
  const prArgs = ['pr', 'view', String(prNumber), '--json', 'reviews,reviewRequests,comments'];
  if (repo) prArgs.push('--repo', repo);
  const data = JSON.parse(execFileSync('gh', prArgs, { encoding: 'utf8' }));

  // Group inline review comments by thread using the GitHub API
  // gh pr view only gives top-level comments; use the REST API for review threads
  const ownerRepo = resolveRepo(repo);
  // --slurp merges all pages into an array of page-arrays; flatten to get all comments
  const threadsRaw = execFileSync(
    'gh',
    ['api', '--paginate', '--slurp', `repos/${ownerRepo}/pulls/${prNumber}/comments`],
    { encoding: 'utf8' }
  );
  const inlineComments = JSON.parse(threadsRaw).flat();

  // Group by in_reply_to_id to reconstruct threads
  const roots = inlineComments.filter(c => !c.in_reply_to_id);
  const threads = roots.map(root => ({
    id: root.id,
    path: root.path,
    line: root.line ?? root.original_line,
    author: root.user.login,
    body: root.body,
    createdAt: root.created_at,
    resolved: root.resolved ?? false,
    replies: inlineComments
      .filter(c => c.in_reply_to_id === root.id)
      .map(r => ({ author: r.user.login, body: r.body, createdAt: r.created_at })),
  }));

  return {
    reviews: data.reviews,
    reviewRequests: data.reviewRequests,
    prComments: data.comments,
    threads,
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
