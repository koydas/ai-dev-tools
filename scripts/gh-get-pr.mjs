#!/usr/bin/env node
// Fetch a GitHub PR by number or head branch → JSON
// Usage: node scripts/gh-get-pr.mjs [<pr-number> | --branch <branch>] [--repo <owner/repo>]
// Node ≥ 20, requires `gh` CLI authenticated

import { execSync } from 'node:child_process';

const FIELDS = 'number,title,body,state,author,headRefName,baseRefName,labels,assignees,reviewRequests,reviews,comments,url,createdAt,updatedAt,mergedAt,isDraft';

export function getPr(identifier, repo) {
  const repoFlag = repo ? `--repo ${repo}` : '';

  if (/^\d+$/.test(String(identifier))) {
    const raw = execSync(
      `gh pr view ${identifier} ${repoFlag} --json ${FIELDS}`,
      { encoding: 'utf8' }
    );
    return JSON.parse(raw);
  }

  // identifier is a branch name
  const raw = execSync(
    `gh pr view --head ${identifier} ${repoFlag} --json ${FIELDS}`,
    { encoding: 'utf8' }
  );
  return JSON.parse(raw);
}

export function getPrDiff(prNumber, repo) {
  const repoFlag = repo ? `--repo ${repo}` : '';
  return execSync(`gh pr diff ${prNumber} ${repoFlag}`, { encoding: 'utf8' });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
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
