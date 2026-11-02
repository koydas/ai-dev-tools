// Context Shunt contract tests: offline, no API key or network required.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shouldShunt, loadSources, sensitivePath } from '../scripts/context-shunt-policy.mjs';
import { decide } from '../scripts/context-shunt-hook.mjs';
import { delegate, parseArgs, verifyResult } from '../scripts/context-shunt.mjs';

const env = { AI_DEV_TOOLS_CONTEXT_SHUNT: '1', ANTHROPIC_API_KEY: 'test-only' };
function workspace(t) {
  const dir = mkdtempSync(join(tmpdir(), 'context-shunt-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'large.js'), Array.from({ length: 400 }, (_, i) => 'const value' + i + ' = ' + i + ';').join('\n'));
  writeFileSync(join(dir, 'small.js'), 'export const answer = 42;\n');
  writeFileSync(join(dir, '.env'), 'SECRET=test-only\n');
  return dir;
}

test('opt-in hook blocks only eligible whole-file reads, without granting permissions', (t) => {
  const cwd = workspace(t);
  const event = { tool_name: 'Read', cwd, tool_input: { file_path: 'large.js' } };
  assert.equal(shouldShunt(event, { env }), true);
  const decision = decide(event, { env });
  assert.equal(decision.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(decide(event, { env: { ...env, AI_DEV_TOOLS_CONTEXT_SHUNT: '0' } }), null);
  assert.equal(decide(event, { env: { AI_DEV_TOOLS_CONTEXT_SHUNT: '1' } }), null);
  assert.equal(decide({ ...event, tool_input: { ...event.tool_input, limit: 20 } }, { env }), null);
  assert.equal(decide({ ...event, tool_input: { file_path: 'small.js' } }, { env }), null);
  assert.equal(decide({ ...event, tool_input: { file_path: '.env' } }, { env }), null);
});

test('file boundary rejects traversal, secrets, symlinks, binary, and oversized inputs', (t) => {
  const cwd = workspace(t);
  const outside = join(tmpdir(), 'shunt-outside-' + process.pid);
  writeFileSync(outside, 'not approved');
  t.after(() => rmSync(outside, { force: true }));
  symlinkSync(outside, join(cwd, 'link.js'));
  writeFileSync(join(cwd, 'binary.js'), Buffer.from([0, 1, 2]));
  assert.deepEqual(loadSources(['small.js'], { cwd })[0].lines, ['export const answer = 42;', '']);
  for (const path of ['../outside', outside, '.env', 'link.js', 'binary.js']) {
    assert.throws(() => loadSources([path], { cwd }));
  }
  assert.throws(() => loadSources(['large.js'], { cwd, maxBytes: 10 }));
  assert.throws(() => loadSources(['small.js', 'small.js'], { cwd }));
  assert.equal(sensitivePath('config/secrets.yaml'), true);
  assert.equal(sensitivePath('config/secretary.ts'), false); // Still no content-based secret detection.
  assert.equal(sensitivePath('config/secrets/token'), true);
});

test('CLI requires an explicit question and bounded file list', () => {
  assert.deepEqual(parseArgs(['--question', 'What does it do?', '--paths', 'a.js', 'b.js']),
    { question: 'What does it do?', paths: ['a.js', 'b.js'], json: false });
  assert.throws(() => parseArgs(['--paths', 'a.js']), /Question/);
  assert.throws(() => parseArgs(['--question', 'ok', '--paths', 'a.js', '--typo']), /Unknown/);
});

test('citation verifier rejects invented file, line, quote, and ungrounded answers', () => {
  const source = [{ path: 'small.js', lines: ['export const answer = 42;'] }];
  const valid = { summary: 'The value is 42.', citations: [{ path: 'small.js', line: 1, quote: 'answer = 42' }] };
  assert.equal(verifyResult(valid, source).citations[0].verified, true);
  for (const c of [{ path: 'bad.js', line: 1, quote: 'answer' },
    { path: 'small.js', line: 2, quote: 'answer' },
    { path: 'small.js', line: 1, quote: 'answer = 43' }]) {
    assert.throws(() => verifyResult({ ...valid, citations: [c] }, source), /unverified/);
  }
  assert.throws(() => verifyResult({ summary: 'Unknown', citations: [] }, source), /contract/);
});

test('delegate sends the bounded corpus to Haiku and records actual provider usage', async (t) => {
  const cwd = workspace(t);
  let calls = 0;
  const fetchImpl = async (url, request) => {
    calls++;
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(request.headers['x-api-key'], 'test-only');
    const payload = JSON.parse(request.body);
    assert.equal(payload.model, 'claude-haiku-5-5');
    assert.match(payload.messages[0].content, /export const answer = 42/);
    return { ok: true, json: async () => ({
      model: payload.model, stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify({
        summary: 'Exports answer = 42.', citations: [{ path: 'small.js', line: 1, quote: 'answer = 42' }],
      }) }],
      usage: { input_tokens: 100, output_tokens: 20 },
    }) };
  };
  const result = await delegate({ cwd, env, question: 'What is exported?', paths: ['small.js'], fetchImpl });
  assert.equal(calls, 1);
  assert.equal(result.citations[0].verified, true);
  assert.equal(result.usage.input_tokens, 100);
  assert.ok(result.proxy.source_chars > 0);
});

test('failed worker response never becomes a trusted answer', async (t) => {
  const cwd = workspace(t);
  await assert.rejects(() => delegate({
    cwd, env, question: 'What?', paths: ['small.js'],
    fetchImpl: async () => ({ ok: true, json: async () => ({
      stop_reason: 'max_tokens', content: [], usage: {},
    }) }),
  }), /incomplete/);
  await assert.rejects(() => delegate({
    cwd, env: { ...env, AI_DEV_TOOLS_CONTEXT_SHUNT: '0' },
    question: 'What?', paths: ['small.js'], fetchImpl: () => { throw Error('called'); },
  }), /opt in/);
});
