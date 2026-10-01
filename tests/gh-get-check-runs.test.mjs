import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCheckRun, parseArgs, parseCheckRunLines } from '../scripts/gh-get-check-runs.mjs';

const SHA = 'a'.repeat(40);

test('parseArgs: a single SHA', () => {
  assert.deepEqual(parseArgs([SHA]), { sha: SHA, repo: undefined });
  assert.deepEqual(parseArgs(['abc1234']), { sha: 'abc1234', repo: undefined });
});

test('parseArgs: --repo is accepted before or after the SHA', () => {
  assert.deepEqual(parseArgs(['--repo', 'o/r', SHA]), { sha: SHA, repo: 'o/r' });
  assert.deepEqual(parseArgs([SHA, '--repo', 'o/r']), { sha: SHA, repo: 'o/r' });
});

test('parseArgs: --merge-base with an explicit ref', () => {
  assert.deepEqual(parseArgs(['--merge-base', 'origin/develop']), { mergeBase: 'origin/develop', repo: undefined });
  assert.deepEqual(parseArgs(['--merge-base', 'origin/main', '--repo', 'o/r']), { mergeBase: 'origin/main', repo: 'o/r' });
});

test('parseArgs: --merge-base without a ref uses the configured default', () => {
  assert.deepEqual(parseArgs(['--merge-base'], { defaultRef: 'origin/main' }), { mergeBase: 'origin/main', repo: undefined });
  assert.deepEqual(parseArgs(['--merge-base', '--repo', 'o/r'], { defaultRef: 'origin/main' }), { mergeBase: 'origin/main', repo: 'o/r' });
});

test('parseArgs: --merge-base without a ref and without a default fails', () => {
  assert.throws(() => parseArgs(['--merge-base']), /requires a ref/);
});

test('parseArgs: a SHA together with --merge-base fails', () => {
  assert.throws(() => parseArgs(['--merge-base', 'origin/main', SHA]), /unexpected argument/);
});

test('parseArgs: no argument, extra arguments and non-SHA values fail', () => {
  assert.throws(() => parseArgs([]), /Usage/);
  assert.throws(() => parseArgs([SHA, SHA]), /Usage/);
  assert.throws(() => parseArgs(['main']), /not a commit SHA: main/);
  assert.throws(() => parseArgs(['--repo']), /--repo requires/);
});

test('normalizeCheckRun: keeps name, status, conclusion and URL', () => {
  const run = normalizeCheckRun({ name: 'test', status: 'completed', conclusion: 'failure', html_url: 'https://x/1', id: 7, output: {} });
  assert.deepEqual(run, { name: 'test', status: 'completed', conclusion: 'failure', html_url: 'https://x/1' });
});

test('normalizeCheckRun: an in-progress run has a null conclusion', () => {
  assert.deepEqual(normalizeCheckRun({ name: 'lint', status: 'in_progress' }), {
    name: 'lint', status: 'in_progress', conclusion: null, html_url: null,
  });
});

test('normalizeCheckRun: rejects a run without a name', () => {
  assert.throws(() => normalizeCheckRun({ status: 'completed' }), /without a name/);
  assert.throws(() => normalizeCheckRun(null), /without a name/);
});

test('parseCheckRunLines: one object per line across pages, blank lines ignored', () => {
  const text = [
    JSON.stringify({ name: 'test', status: 'completed', conclusion: 'success', html_url: 'u1' }),
    '',
    JSON.stringify({ name: 'lint', status: 'completed', conclusion: 'failure', html_url: 'u2' }),
    '',
  ].join('\n');
  assert.deepEqual(parseCheckRunLines(text).map((r) => [r.name, r.conclusion]), [['test', 'success'], ['lint', 'failure']]);
});

test('parseCheckRunLines: empty output means no check runs', () => {
  assert.deepEqual(parseCheckRunLines(''), []);
  assert.deepEqual(parseCheckRunLines(undefined), []);
});

test('parseCheckRunLines: invalid JSON reports the line number', () => {
  const text = `${JSON.stringify({ name: 'test' })}\n{not json`;
  assert.throws(() => parseCheckRunLines(text), /line 2/);
});
