// REST helpers shared by the gh-* scripts. They call `gh api` (REST) rather than `gh pr view` /
// `gh issue view` / `gh repo view`, which go through GraphQL — refused in some environments
// (e.g. Claude Code cloud sessions answer HTTP 403). The mappers rebuild the field names and
// shapes those `gh … --json` commands returned, so commands and agents read the same JSON.
// Node ≥ 20, requires `gh` CLI authenticated

import { execFileSync } from 'node:child_process';

const REPO_PATTERN = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

// Pure: `repos/<owner>/<repo>` — without a repo, gh api fills `{owner}/{repo}` from the current directory.
export function repoPath(repo) {
  if (repo && !REPO_PATTERN.test(repo)) throw new Error(`not an owner/repo: ${repo}`);
  return `repos/${repo || '{owner}/{repo}'}`;
}

// GET a REST endpoint → parsed JSON. paginate: every page, flattened into one array.
export function ghApi(endpoint, { paginate = false } = {}) {
  const args = paginate ? ['api', '--paginate', '--slurp', endpoint] : ['api', endpoint];
  const out = JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  return paginate ? out.flat() : out;
}

// Pure mappers: REST payload → the shape of `gh … --json`.
export const toAuthor = (user) => (user ? { login: user.login } : null);
export const toLabels = (labels) => (labels ?? []).map((l) => ({ name: l.name, color: l.color, description: l.description ?? '' }));
export const toAssignees = (users) => (users ?? []).map(toAuthor).filter(Boolean);
export const toComments = (comments) => (comments ?? []).map((c) => ({
  author: toAuthor(c.user), body: c.body ?? '', createdAt: c.created_at, url: c.html_url,
}));

export function toPr(pr, { reviews = [], comments = [] } = {}) {
  const headRepo = pr.head?.repo?.full_name ?? null;
  return {
    number: pr.number,
    title: pr.title,
    body: pr.body ?? '',
    state: pr.merged_at ? 'MERGED' : String(pr.state).toUpperCase(),
    author: toAuthor(pr.user),
    headRefName: pr.head?.ref,
    headRefOid: pr.head?.sha,
    baseRefName: pr.base?.ref,
    // A deleted fork leaves head.repo null: still cross-repository.
    isCrossRepository: headRepo === null || headRepo.toLowerCase() !== String(pr.base?.repo?.full_name).toLowerCase(),
    labels: toLabels(pr.labels),
    assignees: toAssignees(pr.assignees),
    reviewRequests: [
      ...(pr.requested_reviewers ?? []).map((u) => ({ login: u.login })),
      ...(pr.requested_teams ?? []).map((t) => ({ name: t.name, slug: t.slug })),
    ],
    reviews: reviews.map((r) => ({
      author: toAuthor(r.user), state: r.state, body: r.body ?? '', submittedAt: r.submitted_at ?? null, commit: { oid: r.commit_id },
    })),
    comments: toComments(comments),
    url: pr.html_url,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    mergedAt: pr.merged_at ?? null,
    isDraft: pr.draft === true,
  };
}

export function toIssue(issue, { comments } = {}) {
  const out = {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? '',
    state: String(issue.state).toUpperCase(),
    labels: toLabels(issue.labels),
    assignees: toAssignees(issue.assignees),
    author: toAuthor(issue.user),
    url: issue.html_url,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
  };
  if (comments) out.comments = toComments(comments);
  return out;
}
