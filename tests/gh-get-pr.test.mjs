import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrRef, repoFromPrUrl, mapRestPr } from '../scripts/gh-get-pr.mjs';

test('parsePrRef: bare number and #number carry no repo', () => {
  assert.deepEqual(parsePrRef('42'), { number: 42, repo: undefined });
  assert.deepEqual(parsePrRef('#42'), { number: 42, repo: undefined });
  assert.deepEqual(parsePrRef(' 7 '), { number: 7, repo: undefined });
});

test('parsePrRef: owner/repo#number', () => {
  assert.deepEqual(parsePrRef('koydas/autonomous-dev-loop#176'), { number: 176, repo: 'koydas/autonomous-dev-loop' });
  assert.deepEqual(parsePrRef('my-org/repo.name_x#1'), { number: 1, repo: 'my-org/repo.name_x' });
});

test('parsePrRef: PR URL, with or without a sub-page, query or fragment', () => {
  const expected = { number: 176, repo: 'koydas/autonomous-dev-loop' };
  assert.deepEqual(parsePrRef('https://github.com/koydas/autonomous-dev-loop/pull/176'), expected);
  assert.deepEqual(parsePrRef('https://github.com/koydas/autonomous-dev-loop/pull/176/files'), expected);
  assert.deepEqual(parsePrRef('https://github.com/koydas/autonomous-dev-loop/pull/176#issuecomment-1'), expected);
  assert.deepEqual(parsePrRef('https://github.com/koydas/autonomous-dev-loop/pull/176?w=1'), expected);
});

test('parsePrRef: anything else fails', () => {
  for (const bad of ['', undefined, 'main', '42a', 'owner#42', 'https://github.com/o/r/issues/42',
    'https://github.com/o/r/pull/', 'http://github.com/o/r/pull/1', 'https://example.com/o/r/pull/1', 'https://github.com/o/r/pull/12x']) {
    assert.throws(() => parsePrRef(bad), /not a PR reference/, String(bad));
  }
});

test('repoFromPrUrl: owner/repo from a PR url, null otherwise', () => {
  assert.equal(repoFromPrUrl('https://github.com/o/r/pull/3'), 'o/r');
  assert.equal(repoFromPrUrl('https://github.com/o/r/issues/3'), null);
  assert.equal(repoFromPrUrl(undefined), null);
});

// Trimmed from a real REST `pulls/176` response.
const SHA = '858fbfdeb6b4ff3948df463bb658366c8c1aaa5c';
const REST_PR = {
  number: 176, title: 'fix(guardrails)', body: 'b', state: 'closed', merged: true, merged_at: '2026-10-05T17:51:29Z',
  draft: false, html_url: 'https://github.com/koydas/autonomous-dev-loop/pull/176', user: { login: 'koydas' },
  labels: [{ name: 'review-approved', color: '0e8a16' }], assignees: [{ login: 'koydas' }],
  requested_reviewers: [{ login: 'bob' }], requested_teams: [],
  head: { ref: 'chore/x', sha: SHA, repo: { full_name: 'koydas/autonomous-dev-loop' } },
  base: { ref: 'main', repo: { full_name: 'koydas/autonomous-dev-loop' } },
  created_at: '2026-10-05T14:31:21Z', updated_at: '2026-10-05T17:51:29Z',
};

test('mapRestPr: REST PR + activity → every gh pr view field', () => {
  const pr = mapRestPr(REST_PR, {
    reviews: [{ node_id: 'PRR_1', user: { login: 'alice' }, body: '', state: 'APPROVED', submitted_at: 't', commit_id: SHA }],
    issueComments: [{ node_id: 'IC_1', user: { login: 'koydas' }, body: 'hi', created_at: 't2', html_url: 'u' }],
  });
  assert.deepEqual(pr, {
    number: 176, title: 'fix(guardrails)', body: 'b', state: 'MERGED', author: { login: 'koydas' },
    headRefName: 'chore/x', headRefOid: SHA, baseRefName: 'main', isCrossRepository: false,
    labels: [{ name: 'review-approved' }], assignees: [{ login: 'koydas' }],
    reviewRequests: [{ __typename: 'User', login: 'bob' }],
    reviews: [{ id: 'PRR_1', author: { login: 'alice' }, body: '', state: 'APPROVED', submittedAt: 't', commit: { oid: SHA } }],
    comments: [{ id: 'IC_1', author: { login: 'koydas' }, body: 'hi', createdAt: 't2', url: 'u' }],
    url: 'https://github.com/koydas/autonomous-dev-loop/pull/176',
    createdAt: '2026-10-05T14:31:21Z', updatedAt: '2026-10-05T17:51:29Z', mergedAt: '2026-10-05T17:51:29Z', isDraft: false,
  });
});

test('mapRestPr: open, closed, draft; data the input does not carry is null, not an empty list', () => {
  assert.equal(mapRestPr({ ...REST_PR, merged: false, merged_at: null, state: 'open' }).state, 'OPEN');
  assert.equal(mapRestPr({ ...REST_PR, merged: false, merged_at: null }).state, 'CLOSED');
  const pr = mapRestPr({ number: 1, draft: true, head: { sha: SHA } });
  assert.deepEqual([pr.isDraft, pr.title, pr.body, pr.state], [true, '', '', null]);
  assert.deepEqual([pr.assignees, pr.reviewRequests, pr.reviews, pr.comments], [null, null, null, null]);
  // An absent labels key is an empty list: the MCP response omits it when a PR has no labels.
  assert.deepEqual(pr.labels, []);
});

test('mapRestPr: present-but-empty lists stay empty lists', () => {
  const pr = mapRestPr({ ...REST_PR, assignees: [], requested_reviewers: [] }, { reviews: [], issueComments: [] });
  assert.deepEqual([pr.assignees, pr.reviewRequests, pr.reviews, pr.comments], [[], [], [], []]);
});

test('mapRestPr: fork, deleted fork and case-insensitive same repo', () => {
  const head = (full_name) => ({ ...REST_PR, head: { ...REST_PR.head, repo: full_name ? { full_name } : null } });
  assert.equal(mapRestPr(head('someone/autonomous-dev-loop')).isCrossRepository, true);
  assert.equal(mapRestPr(head(null)).isCrossRepository, true);
  assert.equal(mapRestPr(head('Koydas/Autonomous-Dev-Loop')).isCrossRepository, false);
});

test('mapRestPr: rejects anything that is not a PR object', () => {
  for (const bad of [null, undefined, 'x', {}, { number: '176' }]) {
    assert.throws(() => mapRestPr(bad), /missing integer "number"/);
  }
});
