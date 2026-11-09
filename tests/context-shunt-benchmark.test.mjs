// Offline A/B benchmark checks. No API key, network access or live model calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callPrimary, normalizeUsage, pricedCost, runPaired, score } from '../scripts/context-shunt-benchmark-core.mjs';
import { argsOf, loadCases, main } from '../scripts/context-shunt-benchmark.mjs';

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'shunt-ab-'));
  t.after(() => rmSync(cwd, { force: true, recursive: true }));
  writeFileSync(join(cwd, 'sample.js'), 'export const ANSWER = 42;\n');
  const cases = [{ id: 'answer-42', question: 'What is exported?',
    paths: ['sample.js'], must_include: ['answer', '42'] }];
  const file = join(cwd, 'cases.json');
  writeFileSync(file, JSON.stringify({ cases }));
  return { cwd, cases, file };
}

test('pricing uses actual input/output/cache usage; unknown is never interpreted as zero', () => {
  const price = { models: { model: { input: 1, output: 2, cacheRead: 0.2, cacheWrite: 1.25 } } };
  const usage = { input_tokens: 1000000, output_tokens: 1000000,
    cache_read_input_tokens: 1000000, cache_creation_input_tokens: 1000000 };
  assert.equal(pricedCost('model', usage, price), 4.45);
  assert.equal(pricedCost('missing', usage, price), null);
  assert.equal(pricedCost('model', { input_tokens: 1 }, price), null);
  assert.equal(pricedCost('model', usage, null), null);
  assert.equal(normalizeUsage({ input_tokens: 4 }).cache_read_input_tokens, null);
});

test('case validator bounds count, phrases, paths and case ids before spending', (t) => {
  const { cwd, cases, file } = fixture(t);
  assert.deepEqual(loadCases(file, cwd), cases);
  assert.throws(() => loadCases(file, '/'), /outside|file|scope|ENOENT/i);
  writeFileSync(file, JSON.stringify({ cases: [cases[0], cases[0]] }));
  assert.throws(() => loadCases(file, cwd), /Duplicate/);
  writeFileSync(file, JSON.stringify({ cases: [{ ...cases[0], paths: ['../.env'] }] }));
  assert.throws(() => loadCases(file, cwd), /outside|scope/i);
});

test('plan does not need a credential or call the network; live requires two opt-ins', async (t) => {
  const { cwd, file } = fixture(t);
  const plan = await main(['--cases', file, '--repeats', '2'], { cwd, env: {} });
  assert.equal(plan.live, false);
  assert.equal(plan.expected_api_calls, 6);
  await assert.rejects(() => main(['--cases', file, '--live'], { cwd, env: {} }), /requires/);
  assert.throws(() => argsOf(['--repeats', '4']), /Repeats/);
  assert.throws(() => argsOf(['--model', 'invalid']), /model/);
});

test('primary call validates source quotes and captures actual provider usage', async (t) => {
  const { cwd } = fixture(t);
  const sources = [{ path: 'sample.js', lines: ['export const ANSWER = 42;', ''] }];
  const fetchImpl = async (_, request) => {
    const body = JSON.parse(request.body);
    assert.equal(body.model, 'claude-sonnet-5-5');
    assert.match(body.messages[0].content, /export const ANSWER/);
    return { ok: true, json: async () => ({ model: body.model, stop_reason: 'end_turn',
      usage: { input_tokens: 200, output_tokens: 20, cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0 },
      content: [{ type: 'text', text: JSON.stringify({
        summary: 'Exports answer 42', citations: [{ path: 'sample.js', line: 1, quote: 'ANSWER = 42' }],
      }) }],
    }) };
  };
  const res = await callPrimary({ question: 'What?', sources, model: 'claude-sonnet-5-5',
    env: { ANTHROPIC_API_KEY: 'test' }, fetchImpl });
  assert.equal(res.answer.citations[0].verified, true);
  assert.equal(res.usage.input_tokens, 200);
  assert.ok(res.input_chars > 0);
  assert.equal(score(res.answer, ['answer', '42']), true);
});

test('paired cross-over records complete cost, latency, grade, and no source contents', async (t) => {
  const { cwd, cases } = fixture(t);
  let tick = 0;
  const now = () => ++tick * 10;
  const workerFn = async () => ({ summary: 'Exports ANSWER = 42.',
    citations: [{ path: 'sample.js', line: 1, quote: 'ANSWER = 42', verified: true }],
    model: 'worker', usage: { input_tokens: 4, output_tokens: 2,
      cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } });
  const primaryFn = async ({ evidence }) => ({ answer: { summary: 'The answer is 42.', citations: [] },
    model: 'primary', usage: { input_tokens: evidence ? 5 : 12, output_tokens: 2,
      cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, input_chars: evidence ? 150 : 800 });
  const prices = { models: {
    worker: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    primary: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0 },
  } };
  const result = await runPaired({ cases, cwd, env: {}, model: 'primary', prices,
    repeats: 2, workerFn, primaryFn, now });
  assert.deepEqual(result.results.map((r) => r.arm), ['direct', 'shunt', 'shunt', 'direct']);
  assert.equal(result.summary.direct.proxy_pass, 2);
  assert.equal(result.summary.shunt.proxy_pass, 2);
  assert.ok(result.summary.shunt.total_cost_usd < result.summary.direct.total_cost_usd);
  assert.ok(result.summary.shunt.primary_input_tokens < result.summary.direct.primary_input_tokens);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('What is exported?'));
  assert.ok(!serialized.includes('export const'));
});

test('delegation failure remains a failed treatment arm, not a free success', async (t) => {
  const { cwd, cases } = fixture(t);
  const result = await runPaired({ cases, cwd, env: {}, model: 'primary',
    workerFn: async () => { throw Error('secret contents should not appear in report'); },
    primaryFn: async () => ({ answer: { summary: 'answer 42' }, model: 'primary',
      usage: { input_tokens: 5, output_tokens: 1 } }) });
  assert.equal(result.summary.direct.completed, 1);
  assert.equal(result.summary.shunt.completed, 0);
  assert.equal(result.summary.shunt.proxy_pass, 0);
  assert.equal(result.results.find((r) => r.arm === 'shunt').failure_type, 'Error');
  assert.ok(!JSON.stringify(result).includes('secret contents'));
});


test('billed primary responses retain usage even when answer JSON, citations or finish status fail', async (t) => {
  const { cwd, cases } = fixture(t);
  const prices = { models: {
    'claude-sonnet-5-5': { input: 10, output: 20, cacheRead: 1, cacheWrite: 12 },
    worker: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.2 },
  } };
  const workerFn = async () => ({
    summary: 'ANSWER is 42.', citations: [{ path: 'sample.js', line: 1, quote: 'ANSWER = 42' }],
    model: 'worker', usage: { input_tokens: 10, output_tokens: 2,
      cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  });
  const failureModes = [
    ['invalid-json', { stop_reason: 'end_turn', content: [{ type: 'text', text: '{not json' }] }],
    ['invalid-citation', { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({
      summary: 'The answer is 42.', citations: [{ path: 'sample.js', line: 1, quote: 'ANSWER = 43' }],
    }) }] }],
    ['truncated', { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{}' }] }],
  ];
  for (const [mode, response] of failureModes) {
    const result = await runPaired({ cases, cwd, model: 'claude-sonnet-5-5',
      env: { ANTHROPIC_API_KEY: 'mock' }, prices, workerFn,
      fetchImpl: async () => ({ ok: true, json: async () => ({
        model: 'claude-sonnet-5-5',
        usage: { input_tokens: 100, output_tokens: 20,
          cache_read_input_tokens: 50, cache_creation_input_tokens: 10 },
        ...response,
      }) }),
    });
    for (const row of result.results) {
      assert.equal(row.ok, false, mode + '/' + row.arm);
      assert.equal(row.calls.at(-1).role, 'primary', mode);
      assert.equal(row.calls.at(-1).usage.input_tokens, 100, mode);
      assert.equal(row.calls.at(-1).usage.output_tokens, 20, mode);
      assert.equal(row.calls.at(-1).usage.cache_read_input_tokens, 50, mode);
      assert.equal(row.calls.at(-1).usage.cache_creation_input_tokens, 10, mode);
      assert.ok(row.cost_usd > 0, mode);
    }
    assert.equal(result.summary.direct.primary_input_tokens, 100, mode);
    assert.equal(result.summary.shunt.primary_input_tokens, 100, mode);
    assert.ok(result.summary.shunt.total_cost_usd > result.summary.direct.total_cost_usd, mode);
    assert.equal(result.summary.direct.completed, 0);
    assert.equal(result.summary.shunt.completed, 0);
    assert.ok(!JSON.stringify(result).includes('ANSWER = 43'));
  }
});

test('billed worker validation errors retain usage; unknown request costs remain null', async (t) => {
  const { cwd, cases } = fixture(t);
  const env = { AI_DEV_TOOLS_CONTEXT_SHUNT: '1', ANTHROPIC_API_KEY: 'mock' };
  const prices = { models: {
    'claude-haiku-5-5': { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
    'claude-sonnet-5-5': { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 },
  } };
  const good = JSON.stringify({ summary: 'The answer is 42',
    citations: [{ path: 'sample.js', line: 1, quote: 'ANSWER = 42' }] });
  const fetchImpl = async (_url, request) => {
    const { model } = JSON.parse(request.body);
    return { ok: true, json: async () => model === 'claude-haiku-5-5'
      ? { model, stop_reason: 'end_turn',
        usage: { input_tokens: 80, output_tokens: 15,
          cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        content: [{ type: 'text', text: JSON.stringify({
          summary: 'Wrong quote', citations: [{ path: 'sample.js', line: 1, quote: 'ANSWER = 43' }],
        }) }] }
      : { model, stop_reason: 'end_turn', usage: {
        input_tokens: 100, output_tokens: 12,
        cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        content: [{ type: 'text', text: good }] },
    };
  };
  const result = await runPaired({ cases, cwd, model: 'claude-sonnet-5-5',
    env, prices, fetchImpl });
  const direct = result.results.find((r) => r.arm === 'direct');
  const shunt = result.results.find((r) => r.arm === 'shunt');
  assert.equal(direct.ok, true);
  assert.equal(shunt.ok, false);
  assert.equal(shunt.calls.length, 1); // Primary call never happens.
  assert.equal(shunt.calls[0].role, 'worker');
  assert.equal(shunt.calls[0].model, 'claude-haiku-5-5');
  assert.equal(shunt.calls[0].usage.input_tokens, 80);
  assert.ok(shunt.cost_usd > 0);
  assert.equal(result.summary.shunt.primary_input_tokens, null);
  assert.equal(result.summary.shunt.completed, 0);

  const unknown = await runPaired({ cases, cwd, model: 'claude-sonnet-5-5', env, prices,
    fetchImpl: async () => ({ ok: false, status: 429 }) });
  assert.equal(unknown.results[0].cost_usd, null);
  assert.equal(unknown.results[1].cost_usd, null);
  assert.equal(unknown.results[0].calls[0].usage.input_tokens, null);
  assert.equal(unknown.summary.direct.total_cost_usd, null);
  assert.equal(unknown.summary.shunt.total_cost_usd, null);
});
