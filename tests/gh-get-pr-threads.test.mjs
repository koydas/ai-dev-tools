import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildThreads, buildThreadsFromRest } from '../scripts/gh-get-pr-threads.mjs';

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

// REST fallback — shapes trimmed from real `pulls/176/comments` and `pulls/176/ccr/review_threads` responses.
const rc = (id, login, body, extra = {}) => ({
  id, user: login ? { login } : null, body, created_at: `2026-10-0${id % 10}T00:00:00Z`,
  path: 'scripts/lib/output_writer.mjs', line: 94, original_line: 90, in_reply_to_id: undefined, ...extra,
});
const REST = [rc(11, 'koydas', 'root A'), rc(12, 'bot', 'reply A', { in_reply_to_id: 11 }),
  rc(21, 'koydas', 'root B', { line: null, original_line: 103 }), rc(22, 'koydas', 'reply B', { in_reply_to_id: 21, line: null })];
const CCR = [
  { resolved: true, outdated: false, path: 'scripts/lib/output_writer.mjs', line: 94, comment_ids: [11, 12] },
  { resolved: false, outdated: true, path: 'scripts/lib/output_writer.mjs', line: null, comment_ids: [21, 22] },
];

test('buildThreadsFromRest: ccr data gives resolution and outdated state per thread', () => {
  const [a, b] = buildThreadsFromRest(REST, CCR);
  assert.deepEqual(a, {
    id: 11, threadId: null, path: 'scripts/lib/output_writer.mjs', line: 94, author: 'koydas', body: 'root A',
    createdAt: '2026-10-01T00:00:00Z', resolved: true, outdated: false,
    replies: [{ author: 'bot', body: 'reply A', createdAt: '2026-10-02T00:00:00Z' }],
  });
  assert.equal(b.resolved, false);
  assert.equal(b.outdated, true);
  assert.equal(b.line, 103);
});

test('buildThreadsFromRest: without ccr data, resolution is unknown (null), never false', () => {
  const threads = buildThreadsFromRest(REST);
  assert.deepEqual(threads.map((t) => [t.id, t.resolved, t.outdated, t.replies.length]), [[11, null, false, 1], [21, null, true, 1]]);
  assert.deepEqual(buildThreadsFromRest(REST, []).map((t) => t.resolved), [null, null]);
});

test('buildThreadsFromRest: comments outside any ccr thread are grouped by in_reply_to_id, unknown resolution', () => {
  const threads = buildThreadsFromRest([...REST, rc(31, 'x', 'late root'), rc(32, 'y', 'late reply', { in_reply_to_id: 31 })], CCR);
  assert.equal(threads.length, 3);
  assert.deepEqual([threads[2].id, threads[2].resolved, threads[2].replies.length], [31, null, 1]);
});

test('buildThreadsFromRest: deleted comments and authors, non-boolean resolved, invalid input', () => {
  const threads = buildThreadsFromRest([rc(12, null, 'reply only')], [
    { resolved: 'yes', outdated: false, line: 5, comment_ids: [11, 12] },
    { resolved: true, comment_ids: [99] },
  ]);
  assert.equal(threads.length, 1);
  assert.deepEqual([threads[0].id, threads[0].author, threads[0].resolved, threads[0].line], [12, null, null, 5]);
  assert.throws(() => buildThreadsFromRest({}), /array of review comments/);
  assert.deepEqual(buildThreadsFromRest([], CCR), []);
});
