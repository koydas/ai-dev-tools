#!/usr/bin/env node
// Fetch a GitHub issue by number → JSON
// Usage: node scripts/gh-get-issue.mjs <issue-number> [--repo <owner/repo>]
// Node ≥ 20, requires `gh` CLI authenticated
// Transport: `gh issue view` (GraphQL) first, REST when it fails (ADR-011); the output's `source`
// says which (`graphql` | `rest`).

import { fileURLToPath } from 'node:url';
import { gh, restList, withGraphqlFallback, resolveRepo } from './gh-transport.mjs';

const FIELDS = 'number,title,body,state,labels,assignees,author,comments,url,createdAt,updatedAt';

// Pure: REST `issues/{n}` object (+ its comments) → the `gh issue view --json FIELDS` shape.
// Data the input does not carry is null (unknown), never an empty default (ADR-011): comments not
// passed, `assignees` key absent. An absent `labels` is an empty list, as in mapRestPr.
export function mapRestIssue(issue, { comments } = {}) {
  if (!issue || typeof issue !== 'object' || !Number.isInteger(issue.number)) {
    throw new Error('not an issue object: missing integer "number"');
  }
  return {
    number: issue.number,
    title: issue.title ?? '',
    body: issue.body ?? '',
    state: String(issue.state ?? '').toUpperCase() || null,
    labels: (issue.labels ?? []).map((l) => ({ name: typeof l === 'string' ? l : l?.name ?? null })),
    assignees: issue.assignees === undefined ? null : issue.assignees.map((a) => ({ login: a?.login ?? null })),
    author: { login: issue.user?.login ?? null },
    comments: comments === undefined ? null : comments.map((c) => ({
      id: c.node_id, author: { login: c.user?.login ?? null }, body: c.body, createdAt: c.created_at, url: c.html_url,
    })),
    url: issue.html_url ?? null,
    createdAt: issue.created_at ?? null,
    updatedAt: issue.updated_at ?? null,
  };
}

function getIssueRest(number, ownerRepo) {
  const base = `repos/${ownerRepo}/issues/${number}`;
  return { source: 'rest', ...mapRestIssue(JSON.parse(gh(['api', base])), { comments: restList(`${base}/comments`) }) };
}

export function getIssue(number, repo) {
  const args = ['issue', 'view', String(number), '--json', FIELDS];
  if (repo) args.push('--repo', repo);
  return withGraphqlFallback(
    () => ({ source: 'graphql', ...JSON.parse(gh(args)) }),
    () => getIssueRest(number, resolveRepo(repo)),
  );
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
