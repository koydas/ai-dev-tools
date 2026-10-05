import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repoPath, toPr, toIssue } from '../scripts/gh-rest.mjs';
import { pickPrForBranch } from '../scripts/gh-get-pr.mjs';
import { toIssueList } from '../scripts/gh-my-issues.mjs';

const SHA = 'a'.repeat(40);
const user = (login) => ({ login, id: 1, type: 'User' });
const restPr = (overrides = {}) => ({
  number: 42, title: 'Add x', body: null, state: 'open', merged_at: null, draft: false,
  user: user('alice'), html_url: 'https://github.com/o/r/pull/42',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
  head: { ref: 'feat/x', sha: SHA, repo: { full_name: 'o/r' } },
  base: { ref: 'main', repo: { full_name: 'o/r' } },
  labels: [{ name: 'bug', color: 'f00', description: null }],
  assignees: [user('bob')],
  requested_reviewers: [user('carol')], requested_teams: [{ name: 'Core', slug: 'core' }],
  ...overrides,
});

test('repoPath: explicit repo, placeholders, malformed repo', () => {
  assert.equal(repoPath('o/r.x'), 'repos/o/r.x');
  assert.equal(repoPath(), 'repos/{owner}/{repo}');
  for (const bad of ['o', 'o/r/x', '../r', 'o/r?x']) assert.throws(() => repoPath(bad), /not an owner\/repo/, bad);
});

test('toPr: REST pull → gh pr view --json shape', () => {
  const pr = toPr(restPr(), {
    reviews: [{ user: user('dave'), state: 'APPROVED', body: 'ok', submitted_at: '2026-01-03T00:00:00Z', commit_id: SHA }],
    comments: [{ user: user('erin'), body: 'hi', created_at: '2026-01-04T00:00:00Z', html_url: 'u' }],
  });
  assert.deepEqual(pr, {
    number: 42, title: 'Add x', body: '', state: 'OPEN', author: { login: 'alice' },
    headRefName: 'feat/x', headRefOid: SHA, baseRefName: 'main', isCrossRepository: false,
    labels: [{ name: 'bug', color: 'f00', description: '' }], assignees: [{ login: 'bob' }],
    reviewRequests: [{ login: 'carol' }, { name: 'Core', slug: 'core' }],
    reviews: [{ author: { login: 'dave' }, state: 'APPROVED', body: 'ok', submittedAt: '2026-01-03T00:00:00Z', commit: { oid: SHA } }],
    comments: [{ author: { login: 'erin' }, body: 'hi', createdAt: '2026-01-04T00:00:00Z', url: 'u' }],
    url: 'https://github.com/o/r/pull/42', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
    mergedAt: null, isDraft: false,
  });
});

test('toPr: merged, closed, draft, deleted author', () => {
  assert.equal(toPr(restPr({ state: 'closed', merged_at: '2026-01-05T00:00:00Z' })).state, 'MERGED');
  assert.equal(toPr(restPr({ state: 'closed' })).state, 'CLOSED');
  assert.equal(toPr(restPr({ draft: true })).isDraft, true);
  // normalizePr (ADR-010) keeps the object for a deleted author.
  assert.deepEqual(toPr(restPr({ user: null })).author, { login: null });
  assert.throws(() => toPr(restPr({ head: { ref: 'x', sha: 'short', repo: null } })), /head.sha/);
});

test('toPr: fork, case-insensitive same repo, deleted fork', () => {
  assert.equal(toPr(restPr({ head: { ref: 'x', sha: SHA, repo: { full_name: 'fork/r' } } })).isCrossRepository, true);
  assert.equal(toPr(restPr({ head: { ref: 'x', sha: SHA, repo: { full_name: 'O/R' } } })).isCrossRepository, false);
  assert.equal(toPr(restPr({ head: { ref: 'x', sha: SHA, repo: null } })).isCrossRepository, true);
});

test('toIssue: REST issue → gh issue view --json shape, comments only when given', () => {
  const raw = { number: 7, title: 't', body: 'b', state: 'closed', labels: [], assignees: [], user: user('alice'), html_url: 'u', created_at: 'c', updated_at: 'd' };
  assert.deepEqual(toIssue(raw), { number: 7, title: 't', body: 'b', state: 'CLOSED', labels: [], assignees: [], author: { login: 'alice' }, url: 'u', createdAt: 'c', updatedAt: 'd' });
  assert.deepEqual(toIssue(raw, { comments: [] }).comments, []);
});

test('pickPrForBranch: open PR first, else most recent, none fails', () => {
  const prs = [{ number: 1, state: 'closed', created_at: '2026-01-01' }, { number: 3, state: 'closed', created_at: '2026-03-01' }, { number: 2, state: 'open', created_at: '2026-02-01' }];
  assert.equal(pickPrForBranch(prs, 'b').number, 2);
  assert.equal(pickPrForBranch(prs.filter((p) => p.state === 'closed'), 'b').number, 3);
  assert.throws(() => pickPrForBranch([], 'b'), /no pull requests found for branch "b"/);
  assert.throws(() => pickPrForBranch(undefined, 'b'), /no pull requests found/);
});

test('toIssueList: pull requests excluded, limit applied', () => {
  const items = [1, 2, 3, 4].map((n) => ({ number: n, title: `#${n}`, state: 'open', user: user('a'), ...(n === 2 ? { pull_request: {} } : {}) }));
  assert.deepEqual(toIssueList(items, 2).map((i) => i.number), [1, 3]);
  assert.deepEqual(toIssueList(items, 30).map((i) => i.number), [1, 3, 4]);
});
