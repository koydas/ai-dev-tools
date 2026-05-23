#!/usr/bin/env node
// Fetch a GitHub issue by number → JSON
// Usage: node scripts/gh-get-issue.mjs <issue-number> [--repo <owner/repo>]
// Node ≥ 20, requires `gh` CLI authenticated

import { execSync } from 'node:child_process';

const FIELDS = 'number,title,body,state,labels,assignees,author,comments,url,createdAt,updatedAt';

export function getIssue(number, repo) {
  const repoFlag = repo ? `--repo ${repo}` : '';
  const raw = execSync(
    `gh issue view ${number} ${repoFlag} --json ${FIELDS}`,
    { encoding: 'utf8' }
  );
  return JSON.parse(raw);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
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
