#!/usr/bin/env node
// Fetch a GitHub issue by number → JSON
// Usage: node scripts/gh-get-issue.mjs <issue-number> [--repo <owner/repo>]
// Node ≥ 20, requires `gh` CLI authenticated

import { fileURLToPath } from 'node:url';
import { ghApi, repoPath, toIssue } from './gh-rest.mjs';

// REST, not `gh issue view` (GraphQL) — see scripts/gh-rest.mjs. Same JSON fields as `gh issue view --json`.
export function getIssue(number, repo) {
  const base = `${repoPath(repo)}/issues/${number}`;
  return toIssue(ghApi(base), { comments: ghApi(`${base}/comments?per_page=100`, { paginate: true }) });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const number = args.find(a => /^\d+$/.test(a));
  const repoIdx = args.indexOf('--repo');
  const repo = repoIdx !== -1 ? args[repoIdx + 1] : undefined;

  if (!number) {
    console.error('Usage: node scripts/gh-get-issue.mjs <issue-number> [--repo <owner/repo>]');
    process.exit(1);
  }

  try {
    const issue = getIssue(number, repo);
    console.log(JSON.stringify(issue, null, 2));
  } catch (err) {
    console.error(`Error fetching issue #${number}:`, err.message);
    process.exit(1);
  }
}
