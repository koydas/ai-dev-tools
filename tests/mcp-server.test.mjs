import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer, parseFrontmatter, listPrompts, getPrompt, listResources, readResource } from '../scripts/mcp-server.mjs';
import { TOOLS } from '../scripts/mcp-tools.mjs';

const SERVER = fileURLToPath(new URL('../scripts/mcp-server.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');

function harness({ run = async () => ({ code: 0, stdout: 'ok\n', stderr: '' }) } = {}) {
  const out = [];
  const handle = createServer({ send: (m) => out.push(m), run, serverVersion: '9.9.9' });
  const call = async (method, params, id = out.length + 1) => {
    await handle({ jsonrpc: '2.0', id, method, params });
    return out.find((m) => m.id === id && m.method === undefined);
  };
  return { out, handle, call };
}

test('parseFrontmatter: flat keys, quotes stripped, no frontmatter → whole text', () => {
  assert.deepEqual(parseFrontmatter('---\ndescription: "A: b"\nargument-hint: <n>\n---\n# T\n'), { meta: { description: 'A: b', 'argument-hint': '<n>' }, body: '# T\n' });
  assert.deepEqual(parseFrontmatter('# T'), { meta: {}, body: '# T' });
});

test('initialize: negotiates a supported version, falls back to the latest', async () => {
  const a = harness();
  const r = await a.call('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
  assert.equal(r.result.protocolVersion, '2024-11-05');
  assert.deepEqual(Object.keys(r.result.capabilities).sort(), ['prompts', 'resources', 'tools']);
  assert.equal(r.result.serverInfo.version, '9.9.9');
  const b = harness();
  assert.equal((await b.call('initialize', { protocolVersion: '1999-01-01' })).result.protocolVersion, '2025-06-18');
});

test('notifications get no reply; ping answers {}; unknown method → -32601', async () => {
  const h = harness();
  await h.handle({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(h.out.length, 0);
  assert.deepEqual((await h.call('ping')).result, {});
  assert.equal((await h.call('nope')).error.code, -32601);
});

test('invalid requests → -32600 (non-object, wrong jsonrpc, array)', async () => {
  const h = harness();
  for (const bad of [null, 'x', [], { id: 1, method: 'ping' }]) await h.handle(bad);
  assert.equal(h.out.length, 4);
  assert.ok(h.out.every((m) => m.error.code === -32600));
});

test('tools/list: every tool with schema and annotations', async () => {
  const { result } = await harness().call('tools/list');
  assert.equal(result.tools.length, TOOLS.length);
  for (const t of result.tools) {
    assert.equal(t.inputSchema.type, 'object');
    assert.ok(t.title && t.description && t.annotations);
  }
  assert.equal(result.tools.find((t) => t.name === 'get_issue').annotations.readOnlyHint, true);
});

test('tools/call: runs the script with the validated argv and returns stdout', async () => {
  const seen = [];
  const h = harness({ run: async (inv) => { seen.push(inv); return { code: 0, stdout: '{"n":1}\n', stderr: '' }; } });
  const r = await h.call('tools/call', { name: 'get_issue', arguments: { number: 4, repo: 'o/r' } });
  assert.deepEqual(seen, [{ script: 'gh-get-issue.mjs', args: ['4', '--repo', 'o/r'], stdin: undefined }]);
  assert.deepEqual(r.result, { content: [{ type: 'text', text: '{"n":1}' }], isError: false });
});

test('tools/call: script failure → isError with stderr; invalid args → isError, script never run', async () => {
  const failing = harness({ run: async () => ({ code: 1, stdout: '', stderr: 'gh: not found\n' }) });
  assert.deepEqual((await failing.call('tools/call', { name: 'get_issue', arguments: { number: 1 } })).result, { content: [{ type: 'text', text: 'gh: not found' }], isError: true });
  let ran = false;
  const h = harness({ run: async () => { ran = true; return { code: 0, stdout: '', stderr: '' }; } });
  const r = await h.call('tools/call', { name: 'get_issue', arguments: { number: -1 } });
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /^Invalid arguments/);
  assert.equal(ran, false);
});

test('tools/call: unknown tool → -32602', async () => {
  assert.equal((await harness().call('tools/call', { name: 'rm_rf', arguments: {} })).error.code, -32602);
  assert.equal((await harness().call('tools/call', {})).error.code, -32602);
});

test('post_comment without elicitation support: runs (the client gates the call)', async () => {
  const seen = [];
  const h = harness({ run: async (inv) => { seen.push(inv); return { code: 0, stdout: 'Comment posted: u\n', stderr: '' }; } });
  await h.call('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
  const r = await h.call('tools/call', { name: 'post_comment', arguments: { number: 2, body: 'hi' } });
  assert.equal(r.result.isError, false);
  assert.equal(seen[0].stdin, 'hi');
});

async function elicited(answer) {
  const seen = [];
  const h = harness({ run: async (inv) => { seen.push(inv); return { code: 0, stdout: 'posted', stderr: '' }; } });
  await h.call('initialize', { protocolVersion: '2025-06-18', capabilities: { elicitation: {} } }, 100);
  const pending = h.call('tools/call', { name: 'post_comment', arguments: { number: 2, body: 'hello', repo: 'o/r' } }, 101);
  await new Promise((r) => setImmediate(r));
  const request = h.out.find((m) => m.method === 'elicitation/create');
  assert.ok(request, 'server asked for confirmation');
  assert.match(request.params.message, /o\/r#2[\s\S]*hello/);
  assert.equal(seen.length, 0, 'nothing runs before the answer');
  await h.handle({ jsonrpc: '2.0', id: request.id, result: answer });
  return { response: await pending, seen };
}

test('post_comment with elicitation: accepted → posts', async () => {
  const { response, seen } = await elicited({ action: 'accept', content: { confirm: true } });
  assert.equal(response.result.isError, false);
  assert.equal(seen.length, 1);
});

test('post_comment with elicitation: declined / cancelled / confirm=false → not posted', async () => {
  for (const answer of [{ action: 'decline' }, { action: 'cancel' }, { action: 'accept', content: { confirm: false } }, { action: 'accept' }]) {
    const { response, seen } = await elicited(answer);
    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0].text, /Not posted/);
    assert.equal(seen.length, 0);
  }
});

test('post_comment with elicitation: client gone (abort) → not posted', async () => {
  const h = harness();
  await h.call('initialize', { protocolVersion: '2025-06-18', capabilities: { elicitation: {} } }, 100);
  const pending = h.call('tools/call', { name: 'post_comment', arguments: { number: 2, body: 'x' } }, 101);
  await new Promise((r) => setImmediate(r));
  h.handle.abort();
  assert.equal((await pending).result.isError, true);
});

test('a response with an unknown id is ignored', async () => {
  const h = harness();
  await h.handle({ jsonrpc: '2.0', id: 'srv-99', result: {} });
  assert.equal(h.out.length, 0);
});

test('prompts: commands except sync-ai-dev-tools, with description and argument hint', () => {
  const prompts = listPrompts(ROOT);
  const names = prompts.map((p) => p.name);
  assert.ok(names.includes('pr-review'));
  assert.ok(!names.includes('sync-ai-dev-tools'));
  const pr = prompts.find((p) => p.name === 'pr-review');
  assert.match(pr.description, /PR review/i);
  assert.match(pr.arguments[0].description, /pr-number/);
});

test('prompts/get: placeholders substituted, unknown name rejected', async () => {
  const p = getPrompt('ac-check', { arguments: '42' }, ROOT);
  const text = p.messages[0].content.text;
  assert.match(text, /gh-get-issue\.mjs" 42/);
  assert.ok(!text.includes('${CLAUDE_PLUGIN_ROOT}') && !text.includes('$ARGUMENTS'));
  assert.ok(text.includes(`${ROOT.replaceAll('\\', '/')}/scripts/gh-get-issue.mjs`));
  assert.match(text, /ai-dev-tools:\/\/agents\//);
  assert.equal(getPrompt('ac-check', {}, ROOT).messages[0].content.text.includes('$ARGUMENTS'), false);
  assert.throws(() => getPrompt('../README', {}, ROOT), /unknown prompt/);
  assert.equal((await harness().call('prompts/get', { name: 'nope' })).error.code, -32602);
});

test('resources: every agent listed and readable, plugin root substituted, traversal rejected', async () => {
  const resources = listResources(ROOT);
  assert.ok(resources.some((r) => r.uri === 'ai-dev-tools://agents/pr-analyst'));
  for (const r of resources) {
    assert.equal(r.mimeType, 'text/markdown');
    const { contents } = readResource(r.uri, ROOT);
    assert.ok(!contents[0].text.includes('${CLAUDE_PLUGIN_ROOT}'), r.uri);
  }
  assert.throws(() => readResource('ai-dev-tools://agents/../README', ROOT), /unknown resource/);
  assert.equal((await harness().call('resources/read', { uri: 'file:///etc/passwd' })).error.code, -32002);
});

// End to end: the real process over stdio, real scripts.
test('stdio: initialize → tools/list → normalize_pr → parse error → clean exit on EOF', async () => {
  const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '';
  child.stdout.on('data', (d) => { buffer += d; });
  const exited = new Promise((resolve) => child.on('close', resolve));
  const pr = { number: 5, title: 't', state: 'open', head: { sha: 'a'.repeat(40), ref: 'f', repo: { full_name: 'o/r' } }, base: { ref: 'main', repo: { full_name: 'o/r' } } };
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'normalize_pr', arguments: { pr } } })}\n`);
  child.stdin.write('not json\n');
  child.stdin.end();
  assert.equal(await exited, 0);
  const messages = buffer.trim().split('\n').map((l) => JSON.parse(l));
  const byId = (id) => messages.find((m) => m.id === id);
  assert.equal(byId(1).result.protocolVersion, '2025-06-18');
  assert.equal(byId(2).result.tools.length, TOOLS.length);
  assert.equal(byId(3).result.isError, false);
  const normalized = JSON.parse(byId(3).result.content[0].text);
  assert.equal(normalized.headRefOid, 'a'.repeat(40));
  assert.equal(normalized.repository, 'o/r');
  assert.equal(messages.find((m) => m.id === null).error.code, -32700);
});
