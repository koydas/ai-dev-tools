import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildThreads } from '../scripts/gh-get-pr-threads.mjs';

const comment = (id, login, body) => ({ databaseId: id, author: { login }, body, createdAt: `2026-01-0${id}T00:00:00Z` });
const page = (nodes) => ({ data: { repository: { pullRequest: { reviewThreads: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } } } } });
const thread = (overrides) => ({
  id: 'PRRT_1', isResolved: false, isOutdated: false, path: 'src/a.mjs', line: 10, originalLine: 8,
  comments: { nodes: [comment(1, 'alice', 'root'), comment(2, 'bob', 'reply')] },
  ...overrides,
});

test('buildThreads: root comment, replies and resolution state', () => {
  const [t] = buildThreads([page([thread({ isResolved: true })])]);
  assert.deepEqual(t, {
    id: 1, threadId: 'PRRT_1', path: 'src/a.mjs', line: 10, author: 'alice', body: 'root',
    createdAt: '2026-01-01T00:00:00Z', resolved: true, outdated: false,
    replies: [{ author: 'bob', body: 'reply', createdAt: '2026-01-02T00:00:00Z' }],
  });
});

test('buildThreads: an unresolved thread is reported unresolved', () => {
  assert.equal(buildThreads([page([thread()])])[0].resolved, false);
});

test('buildThreads: outdated thread falls back to originalLine', () => {
  const [t] = buildThreads([page([thread({ isOutdated: true, line: null })])]);
  assert.equal(t.outdated, true);
  assert.equal(t.line, 8);
});

test('buildThreads: flattens every page in order', () => {
  const threads = buildThreads([page([thread({ id: 'A' })]), page([thread({ id: 'B' }), thread({ id: 'C' })])]);
  assert.deepEqual(threads.map((t) => t.threadId), ['A', 'B', 'C']);
});

test('buildThreads: deleted author is null, threads without comments are skipped', () => {
  const threads = buildThreads([page([
    thread({ comments: { nodes: [{ ...comment(1, 'x', 'root'), author: null }] } }),
    thread({ id: 'EMPTY', comments: { nodes: [] } }),
  ])]);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].author, null);
  assert.deepEqual(threads[0].replies, []);
});

test('buildThreads: invalid input fails loudly', () => {
  assert.throws(() => buildThreads({}), /array of GraphQL pages/);
  assert.throws(() => buildThreads([{ data: { repository: null } }]), /page 1 has no reviewThreads/);
  assert.throws(() => buildThreads([{ errors: [{ message: 'nope' }] }]), /page 1 has no reviewThreads/);
});
