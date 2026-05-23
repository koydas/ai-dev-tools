#!/usr/bin/env node
// Post a comment to a GitHub issue or PR
// Usage: node scripts/gh-post-comment.mjs <issue-or-pr-number> <body> [--repo <owner/repo>]
//        echo "body" | node scripts/gh-post-comment.mjs <number> [--repo <owner/repo>]
// Node ≥ 20, requires `gh` CLI authenticated

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export function postComment(number, body, repo) {
  const repoFlag = repo ? `--repo ${repo}` : '';
  const result = spawnSync(
    'gh',
    ['issue', 'comment', String(number), '--body', body, ...repoFlag.split(' ').filter(Boolean)],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || 'gh command failed');
  }

  return result.stdout.trim();
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  const repoIdx = args.indexOf('--repo');
  const repo = repoIdx !== -1 ? args[repoIdx + 1] : undefined;

  const positional = args.filter((a, i) => {
    if (a === '--repo') return false;
    if (i > 0 && args[i - 1] === '--repo') return false;
    return true;
  });

  const number = positional[0];
  let body = positional[1];

  if (!number) {
    console.error('Usage: node scripts/gh-post-comment.mjs <number> <body> [--repo <owner/repo>]');
    process.exit(1);
  }

  // Read body from stdin if not provided as argument
  if (!body && !process.stdin.isTTY) {
    body = readFileSync('/dev/stdin', 'utf8').trim();
  }

  if (!body) {
    console.error('Comment body is required (pass as argument or via stdin).');
    process.exit(1);
  }

  try {
    const url = postComment(number, body, repo);
    console.log(`Comment posted: ${url}`);
  } catch (err) {
    console.error('Error posting comment:', err.message);
    process.exit(1);
  }
}
