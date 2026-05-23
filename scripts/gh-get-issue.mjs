#!/usr/bin/env node
// Fetch a GitHub issue by number → JSON
// Usage: node scripts/gh-get-issue.mjs <issue-number> [--repo <owner/repo>]
// Node ≥ 20, requires `gh` CLI authenticated

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FIELDS = 'number,title,body,state,labels,assignees,author,comments,url,createdAt,updatedAt';

export function getIssue(number, repo) {
  const args = ['issue', 'view', String(number), '--json', FIELDS];
  if (repo) args.push('--repo', repo);
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }));
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
