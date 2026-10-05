import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePr } from '../scripts/normalize-pr.mjs';

const SHA = '314d1bb9b0b23cc8bfe727e03c77c99a97771fef';

// Trimmed from a real GitHub MCP `pull_request_read` (method `get`) response.
const MCP = {
  number: 176, title: 'fix(guardrails): docs/', body: 'b', state: 'open', draft: false, merged: false,
  html_url: 'https://github.com/koydas/autonomous-dev-loop/pull/176',
  user: { login: 'koydas' }, labels: ['review-approved', 'auto-fix-attempt-1'],
  head: { ref: 'chore/x', sha: SHA, repo: { full_name: 'koydas/autonomous-dev-loop' } },
  base: { ref: 'main', sha: 'a'.repeat(40), repo: { full_name: 'koydas/autonomous-dev-loop' } },
  created_at: '2026-10-05T14:31:21Z', updated_at: '2026-10-05T14:33:29Z',
};

test('normalizePr: MCP shape → gh-get-pr.mjs fields', () => {
  assert.deepEqual(normalizePr(MCP), {
    number: 176, title: 'fix(guardrails): docs/', body: 'b', state: 'OPEN', author: { login: 'koydas' },
    headRefName: 'chore/x', headRefOid: SHA, baseRefName: 'main', isCrossRepository: false,
    labels: [{ name: 'review-approved' }, { name: 'auto-fix-attempt-1' }],
    url: 'https://github.com/koydas/autonomous-dev-loop/pull/176', isDraft: false,
    createdAt: '2026-10-05T14:31:21Z', updatedAt: '2026-10-05T14:33:29Z', mergedAt: null,
    repository: 'koydas/autonomous-dev-loop',
  });
});

test('normalizePr: REST shape (label objects, merged_at) → MERGED', () => {
  const pr = normalizePr({ ...MCP, labels: [{ name: 'bug', color: 'f00' }], state: 'closed', merged: undefined, merged_at: '2026-10-06T00:00:00Z' });
  assert.equal(pr.state, 'MERGED');
  assert.equal(pr.mergedAt, '2026-10-06T00:00:00Z');
  assert.deepEqual(pr.labels, [{ name: 'bug' }]);
});

test('normalizePr: fork or unknown head repo is cross-repository, case-insensitive match is not', () => {
  assert.equal(normalizePr({ ...MCP, head: { ...MCP.head, repo: { full_name: 'someone/autonomous-dev-loop' } } }).isCrossRepository, true);
  assert.equal(normalizePr({ ...MCP, head: { ...MCP.head, repo: null } }).isCrossRepository, true);
  assert.equal(normalizePr({ ...MCP, head: { ...MCP.head, repo: { full_name: 'Koydas/Autonomous-Dev-Loop' } } }).isCrossRepository, false);
});

test('normalizePr: draft, missing body and labels', () => {
  const pr = normalizePr({ ...MCP, draft: true, body: null, labels: undefined });
  assert.equal(pr.isDraft, true);
  assert.equal(pr.body, '');
  assert.deepEqual(pr.labels, []);
});

test('normalizePr: rejects objects that are not a PR or lack a full head SHA', () => {
  assert.throws(() => normalizePr(null), /missing integer "number"/);
  assert.throws(() => normalizePr({ number: '176' }), /missing integer "number"/);
  assert.throws(() => normalizePr({ ...MCP, head: { ...MCP.head, sha: '314d1bb' } }), /40-char head.sha/);
  assert.throws(() => normalizePr({ ...MCP, head: undefined }), /40-char head.sha/);
});
