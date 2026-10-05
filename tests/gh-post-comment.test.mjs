import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commentsEndpoint } from '../scripts/gh-post-comment.mjs';

test('commentsEndpoint: explicit repo', () => {
  assert.equal(commentsEndpoint(177, 'koydas/autonomous-dev-loop'), 'repos/koydas/autonomous-dev-loop/issues/177/comments');
  assert.equal(commentsEndpoint('#42', 'my-org/repo.name_x'), 'repos/my-org/repo.name_x/issues/42/comments');
});

test('commentsEndpoint: no repo → gh api placeholders for the current repository', () => {
  assert.equal(commentsEndpoint('7'), 'repos/{owner}/{repo}/issues/7/comments');
});

test('commentsEndpoint: invalid number fails', () => {
  for (const bad of ['', undefined, 'abc', '42a', '4 2', '../1']) {
    assert.throws(() => commentsEndpoint(bad, 'o/r'), /not an issue or PR number/, String(bad));
  }
});

test('commentsEndpoint: malformed repo fails', () => {
  for (const bad of ['owner', 'o/r/x', '../r', 'o/r?x=1']) {
    assert.throws(() => commentsEndpoint(1, bad), /not an owner\/repo/, bad);
  }
});
