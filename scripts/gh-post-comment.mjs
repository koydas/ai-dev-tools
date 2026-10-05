#!/usr/bin/env node
// Post a comment to a GitHub issue or PR
// Usage: node scripts/gh-post-comment.mjs <issue-or-pr-number> <body> [--repo <owner/repo>]
//        echo "body" | node scripts/gh-post-comment.mjs <number> [--repo <owner/repo>]
// Node ≥ 20, requires `gh` CLI authenticated

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Pure: REST endpoint of an issue/PR's comments. Without a repo, gh api resolves {owner}/{repo}
// from the current directory. Throws on a non-numeric number or a malformed repo.
export function commentsEndpoint(number, repo) {
  const n = String(number ?? '').trim().replace(/^#/, '');
  if (!/^\d+$/.test(n)) throw new Error(`not an issue or PR number: ${number}`);
  if (repo && !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) throw new Error(`not an owner/repo: ${repo}`);
  return `repos/${repo || '{owner}/{repo}'}/issues/${n}/comments`;
}

// REST, not `gh issue comment`: that one goes through GraphQL, which some environments
// (e.g. Claude Code cloud sessions) refuse. The body goes through stdin, never the command line.
export function postComment(number, body, repo) {
  const args = ['api', '--method', 'POST', commentsEndpoint(number, repo), '--input', '-', '--jq', '.html_url'];
  const result = spawnSync('gh', args, { encoding: 'utf8', input: JSON.stringify({ body }), stdio: ['pipe', 'pipe', 'pipe'] });

  if (result.status !== 0) {
    throw new Error(result.stderr || 'gh command failed');
  }

  return result.stdout.trim();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
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
    body = readFileSync(0, 'utf8').trim();
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
