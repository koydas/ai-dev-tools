#!/usr/bin/env node
// Fetch a GitHub PR by number or head branch → JSON
// Usage: node scripts/gh-get-pr.mjs [<pr-number> | --branch <branch>] [--repo <owner/repo>]
// Node ≥ 20, requires `gh` CLI authenticated

import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FIELDS = 'number,title,body,state,author,headRefName,baseRefName,labels,assignees,reviewRequests,reviews,comments,url,createdAt,updatedAt,mergedAt,isDraft';

export function getPr(identifier, repo) {
  const args = ['pr', 'view', '--json', FIELDS];
  if (/^\d+$/.test(String(identifier))) {
    args.push(String(identifier));
  } else {
    // Branch name passed positionally — gh pr view accepts a branch as a positional arg
    args.push(String(identifier));
  }
  if (repo) args.push('--repo', repo);
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }));
}

export function getPrDiff(prNumber, repo) {
  const args = ['pr', 'diff', String(prNumber)];
  if (repo) args.push('--repo', repo);
  return execFileSync('gh', args, { encoding: 'utf8' });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const branchIdx = args.indexOf('--branch');
  const repoIdx = args.indexOf('--repo');
  const repo = repoIdx !== -1 ? args[repoIdx + 1] : undefined;

  let identifier;
  if (branchIdx !== -1) {
    identifier = args[branchIdx + 1];
  } else {
    identifier = args.find(a => /^\d+$/.test(a));
  }

  if (!identifier) {
    // Try current branch
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
      identifier = branch;
    } catch {
      console.error('Usage: node scripts/gh-get-pr.mjs [<pr-number> | --branch <branch>] [--repo <owner/repo>]');
      process.exit(1);
    }
  }

  try {
    const pr = getPr(identifier, repo);
    console.log(JSON.stringify(pr, null, 2));
  } catch (err) {
    console.error(`Error fetching PR for "${identifier}":`, err.message);
    process.exit(1);
  }
}
