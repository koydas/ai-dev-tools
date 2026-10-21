import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TOOLS, findTool, buildInvocation } from '../scripts/mcp-tools.mjs';

const inv = (name, input) => buildInvocation(findTool(name), input);

test('every tool names an existing script and a complete definition', () => {
  const names = new Set();
  for (const t of TOOLS) {
    assert.ok(!names.has(t.name), `duplicate ${t.name}`);
    names.add(t.name);
    assert.ok(existsSync(fileURLToPath(new URL(`../scripts/${t.script}`, import.meta.url))), t.script);
    assert.equal(t.inputSchema.type, 'object');
    assert.equal(t.inputSchema.additionalProperties, false);
    assert.equal(typeof t.annotations.readOnlyHint, 'boolean');
    assert.equal(Boolean(t.write), t.annotations.readOnlyHint === false);
  }
});

test('post_comment is the only write tool', () => {
  assert.deepEqual(TOOLS.filter((t) => t.write).map((t) => t.name), ['post_comment']);
});

test('get_issue / get_pr_threads / get_pr_feedback: number then --repo', () => {
  for (const name of ['get_issue', 'get_pr_threads', 'get_pr_feedback']) {
    assert.deepEqual(inv(name, { number: 42, repo: 'a/b' }), { script: findTool(name).script, args: ['42', '--repo', 'a/b'], stdin: undefined });
    assert.deepEqual(inv(name, { number: 7 }).args, ['7']);
    assert.throws(() => inv(name, {}), /missing argument: number/);
    assert.throws(() => inv(name, { number: '7' }), /positive integer/);
    assert.throws(() => inv(name, { number: 0 }), /positive integer/);
  }
});

test('repo must be owner/repo and never a flag', () => {
  assert.throws(() => inv('get_issue', { number: 1, repo: '--help' }), /owner\/repo/);
  assert.throws(() => inv('get_issue', { number: 1, repo: 'a/b; rm' }), /owner\/repo/);
  assert.throws(() => inv('get_issue', { number: 1, repo: 5 }), /owner\/repo/);
});

test('get_pr: exactly one of ref / branch, no leading dash', () => {
  assert.deepEqual(inv('get_pr', { ref: 'o/r#3' }).args, ['o/r#3']);
  assert.deepEqual(inv('get_pr', { branch: 'feat/x', repo: 'o/r' }).args, ['--branch', 'feat/x', '--repo', 'o/r']);
  assert.throws(() => inv('get_pr', {}), /exactly one/);
  assert.throws(() => inv('get_pr', { ref: '1', branch: 'x' }), /exactly one/);
  assert.throws(() => inv('get_pr', { ref: '--repo' }), /not starting with "-"/);
  assert.throws(() => inv('get_pr', { branch: '-x' }), /not starting with "-"/);
  assert.throws(() => inv('get_pr', { ref: '  ' }), /non-empty/);
});

test('get_check_runs: hex sha only', () => {
  assert.deepEqual(inv('get_check_runs', { sha: 'abc1234' }).args, ['abc1234']);
  assert.throws(() => inv('get_check_runs', { sha: '--merge-base' }), /hex/);
  assert.throws(() => inv('get_check_runs', { sha: 'zzzzzzz' }), /hex/);
  assert.throws(() => inv('get_check_runs', { sha: 'abc' }), /hex/);
});

test('my_issues: optional state and limit', () => {
  assert.deepEqual(inv('my_issues', {}).args, []);
  assert.deepEqual(inv('my_issues', { repo: 'o/r', state: 'all', limit: 5 }).args, ['--repo', 'o/r', '--state', 'all', '--limit', '5']);
  assert.throws(() => inv('my_issues', { state: 'merged' }), /one of open, closed, all/);
  assert.throws(() => inv('my_issues', { limit: 0 }), /positive integer/);
});

test('normalize_pr: the PR object goes through stdin, not argv', () => {
  const r = inv('normalize_pr', { pr: { number: 1 } });
  assert.deepEqual(r.args, []);
  assert.equal(r.stdin, '{"number":1}');
  assert.throws(() => inv('normalize_pr', { pr: [] }), /pr must be an object/);
  assert.throws(() => inv('normalize_pr', { pr: 'x' }), /pr must be an object/);
});

test('post_comment: body goes through stdin, never argv', () => {
  const r = inv('post_comment', { number: 3, body: '--repo x\n```', repo: 'o/r' });
  assert.deepEqual(r.args, ['3', '--repo', 'o/r']);
  assert.equal(r.stdin, '--repo x\n```');
  assert.throws(() => inv('post_comment', { number: 3, body: '   ' }), /non-empty/);
  assert.throws(() => inv('post_comment', { number: 3 }), /missing argument: body/);
});

test('unknown arguments and non-object input are rejected', () => {
  assert.throws(() => inv('get_issue', { number: 1, extra: true }), /unknown argument: extra/);
  assert.throws(() => buildInvocation(findTool('get_issue'), []), /must be an object/);
  assert.throws(() => buildInvocation(findTool('get_issue'), null), /must be an object/);
  assert.equal(findTool('nope'), undefined);
});
