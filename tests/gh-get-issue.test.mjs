import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapRestIssue } from '../scripts/gh-get-issue.mjs';
import { mapRestIssueList } from '../scripts/gh-my-issues.mjs';

const REST = {
  number: 7, title: 't', body: null, state: 'closed', user: { login: 'alice' },
  labels: [{ name: 'bug', color: 'f00' }], assignees: [{ login: 'bob' }],
  html_url: 'https://github.com/o/r/issues/7', created_at: 'c', updated_at: 'u',
};

test('mapRestIssue: REST issue → gh issue view --json shape', () => {
  assert.deepEqual(mapRestIssue(REST, { comments: [{ node_id: 'IC_1', user: { login: 'carol' }, body: 'hi', created_at: 'd', html_url: 'cu' }] }), {
    number: 7, title: 't', body: '', state: 'CLOSED', labels: [{ name: 'bug' }], assignees: [{ login: 'bob' }],
    author: { login: 'alice' },
    comments: [{ id: 'IC_1', author: { login: 'carol' }, body: 'hi', createdAt: 'd', url: 'cu' }],
    url: 'https://github.com/o/r/issues/7', createdAt: 'c', updatedAt: 'u',
  });
});

test('mapRestIssue: data the input lacks is null, absent labels an empty list, deleted author keeps the object', () => {
  const issue = mapRestIssue({ number: 1, state: 'open', user: null });
  assert.equal(issue.comments, null);
  assert.equal(issue.assignees, null);
  assert.deepEqual(issue.labels, []);
  assert.deepEqual(issue.author, { login: null });
  assert.equal(issue.url, null);
});

test('mapRestIssue: not an issue fails', () => {
  for (const bad of [null, undefined, {}, { number: '7' }]) {
    assert.throws(() => mapRestIssue(bad), /not an issue object/);
  }
});

test('mapRestIssueList: pull requests dropped, limit applied, gh issue list fields only', () => {
  const items = [1, 2, 3, 4].map((n) => ({ ...REST, number: n, ...(n === 2 ? { pull_request: {} } : {}) }));
  assert.deepEqual(mapRestIssueList(items, 2).map((i) => i.number), [1, 3]);
  assert.deepEqual(mapRestIssueList(items, 30).map((i) => i.number), [1, 3, 4]);
  assert.deepEqual(Object.keys(mapRestIssueList(items, 1)[0]).sort(),
    ['assignees', 'author', 'createdAt', 'labels', 'number', 'state', 'title', 'updatedAt', 'url']);
});
