#!/usr/bin/env node
// List GitHub issues assigned to the current authenticated user
// Usage: node scripts/gh-my-issues.mjs [--repo <owner/repo>] [--state open|closed|all] [--limit <n>]
// Node ≥ 20, requires `gh` CLI authenticated

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FIELDS = 'number,title,state,labels,assignees,author,url,createdAt,updatedAt';

export function getMyIssues({ repo, state = 'open', limit = 30 } = {}) {
  const args = ['issue', 'list', '--assignee', '@me', '--state', state, '--limit', String(limit), '--json', FIELDS];
  if (repo) args.push('--repo', repo);
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }));
}

function formatIssues(issues) {
  if (issues.length === 0) {
    console.log('No issues found.');
    return;
  }
  for (const issue of issues) {
    const labels = issue.labels.map(l => l.name).join(', ');
    const labelStr = labels ? ` [${labels}]` : '';
    console.log(`#${String(issue.number).padEnd(6)} ${issue.title}${labelStr}`);
    console.log(`         ${issue.url}`);
  }
  console.log(`\n${issues.length} issue(s)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const repoIdx = args.indexOf('--repo');
  const stateIdx = args.indexOf('--state');
  const limitIdx = args.indexOf('--limit');

  const options = {
    repo: repoIdx !== -1 ? args[repoIdx + 1] : undefined,
    state: stateIdx !== -1 ? args[stateIdx + 1] : 'open',
    limit: limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 30,
  };

  try {
    const issues = getMyIssues(options);
    if (args.includes('--json')) {
      console.log(JSON.stringify(issues, null, 2));
    } else {
      formatIssues(issues);
    }
  } catch (err) {
    console.error('Error fetching issues:', err.message);
    process.exit(1);
  }
}
