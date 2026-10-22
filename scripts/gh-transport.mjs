#!/usr/bin/env node
// Shared GitHub transport for the gh-* scripts: GraphQL first, REST on failure (ADR-011).
// Library only — no CLI. Node ≥ 20, requires `gh` CLI authenticated.

import { execFileSync } from 'node:child_process';

export const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// Every page of a REST list endpoint, flattened.
export const restList = (endpoint) => JSON.parse(gh(['api', '--paginate', '--slurp', endpoint])).flat();

// Pure: true in a Claude Code cloud session (`CLAUDE_CODE_REMOTE` set to a non-empty value other than
// `0` / `false`), whose egress proxy answers every GraphQL call with HTTP 403 — the attempt is a wasted
// round-trip. `AI_DEV_TOOLS_FORCE_GRAPHQL=1` restores the GraphQL-first path.
export function shouldSkipGraphql(env = process.env) {
  const isOn = (v) => !['', '0', 'false'].includes(String(v ?? '').trim().toLowerCase());
  return isOn(env.CLAUDE_CODE_REMOTE) && String(env.AI_DEV_TOOLS_FORCE_GRAPHQL ?? '').trim() !== '1';
}

// Runs `graphql()`; on any failure, logs one line and returns `rest()` instead. A REST failure propagates.
// In a cloud session (shouldSkipGraphql) `graphql()` is not attempted and nothing is logged.
export function withGraphqlFallback(graphql, rest, log = (line) => console.error(line)) {
  if (shouldSkipGraphql()) return rest();
  try {
    return graphql();
  } catch (err) {
    const reason = String(err?.stderr || err?.message || err).split('\n')[0].slice(0, 120);
    log(`GraphQL unavailable (${reason}) — falling back to REST`);
    return rest();
  }
}

// Pure: the first option in `args` that is neither a value option (its next token is consumed) nor a
// boolean option, or null. Any token starting with `-` counts as an option.
export function findUnknownFlag(args, { value = [], bool = [] } = {}) {
  for (let i = 0; i < args.length; i += 1) {
    const a = String(args[i]);
    if (value.includes(a)) i += 1;
    else if (!bool.includes(a) && a.startsWith('-')) return a;
  }
  return null;
}

// CLI guard: unknown option → `Error …` + usage on stderr, exit 1 (before any network call).
export function exitOnUnknownFlag(args, spec, usage) {
  const flag = findUnknownFlag(args, spec);
  if (!flag) return;
  console.error(`Error: unknown option ${flag}\n${usage}`);
  process.exit(1);
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
    if (shouldSkipGraphql()) throw new Error('GraphQL skipped');
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
