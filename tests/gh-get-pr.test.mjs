import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrRef, repoFromPrUrl } from '../scripts/gh-get-pr.mjs';

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
