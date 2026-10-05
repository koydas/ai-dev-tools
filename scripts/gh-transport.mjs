#!/usr/bin/env node
// Shared GitHub transport for the gh-* scripts: GraphQL first, REST on failure (ADR-011).
// Library only — no CLI. Node ≥ 20, requires `gh` CLI authenticated.

import { execFileSync } from 'node:child_process';

export const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// Every page of a REST list endpoint, flattened.
export const restList = (endpoint) => JSON.parse(gh(['api', '--paginate', '--slurp', endpoint])).flat();

// Runs `graphql()`; on any failure, logs one line and returns `rest()` instead. A REST failure propagates.
export function withGraphqlFallback(graphql, rest, log = (line) => console.error(line)) {
  try {
    return graphql();
  } catch (err) {
    const reason = String(err?.stderr || err?.message || err).split('\n')[0].slice(0, 120);
    log(`GraphQL unavailable (${reason}) — falling back to REST`);
    return rest();
  }
}

// Pure: owner/repo from a GitHub remote URL (https or ssh), null otherwise.
export function repoFromRemoteUrl(url) {
  const m = String(url ?? '').trim().match(/github\.com[/:]([A-Za-z0-9-]+\/[A-Za-z0-9._-]+?)(?:\.git)?\/?$/);
  return m ? m[1] : null;
}

// owner/repo: the given value, else `gh repo view` (GraphQL), else the origin remote.
export function resolveRepo(repo) {
  if (repo) return repo;
  try {
    return gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).trim();
  } catch { /* gh repo view uses GraphQL: fall back to the origin remote */ }
  let fromRemote = null;
  try {
    fromRemote = repoFromRemoteUrl(execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch { /* not a git clone */ }
  if (!fromRemote) throw new Error('Could not determine repository. Pass --repo <owner/repo>.');
  return fromRemote;
}

// Pure: REST reviews / requested reviewers / issue comments → the `gh pr view --json` field shapes.
export function mapRestPrActivity({ reviews = [], requested = {}, issueComments = [] } = {}) {
  return {
    reviews: reviews.map((r) => ({
      id: r.node_id, author: { login: r.user?.login ?? null }, body: r.body,
      state: r.state, submittedAt: r.submitted_at, commit: { oid: r.commit_id },
    })),
    reviewRequests: [
      ...(requested.users ?? []).map((u) => ({ __typename: 'User', login: u.login })),
      ...(requested.teams ?? []).map((t) => ({ __typename: 'Team', name: t.name, slug: t.slug })),
    ],
    prComments: issueComments.map((c) => ({
      id: c.node_id, author: { login: c.user?.login ?? null }, body: c.body,
      createdAt: c.created_at, url: c.html_url,
    })),
  };
}
