import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditTokens } from '../scripts/token-audit.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/token-audit.mjs', import.meta.url));
let src;

const entry = (model, usage) => JSON.stringify({ timestamp: new Date().toISOString(), message: { model, usage } });

// Session "plain" ranks first without cache (150 vs 20); session "cached" ranks first with it (1 520 vs 150).
before(() => {
  src = mkdtempSync(join(tmpdir(), 'token-audit-'));
  mkdirSync(join(src, 'proj-a'));
  mkdirSync(join(src, 'proj-b'));
  writeFileSync(join(src, 'proj-a', 'plain.jsonl'), entry('m1', { input_tokens: 100, output_tokens: 50 }) + '\n');
  writeFileSync(join(src, 'proj-b', 'cached.jsonl'), [
    entry('m2', { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 500 }),
    'not json',
  ].join('\n') + '\n');
});
after(() => rmSync(src, { recursive: true, force: true }));

const cli = (...args) => spawnSync(process.execPath, [SCRIPT, '--src', src, ...args], { encoding: 'utf8', timeout: 10_000 });

test('auditTokens default: cache tokens are reported but excluded from model, day and session counts', () => {
  const r = auditTokens({ src });
  assert.deepEqual(r.totals, { input: 110, output: 60, cacheRead: 1000, cacheWrite: 500 });
  assert.equal('includeCache' in r, false);
  assert.deepEqual(r.byModel, { m1: { input: 100, output: 50, total: 150 }, m2: { input: 10, output: 10, total: 20 } });
  assert.deepEqual(r.topSessions.map((s) => [s.project, s.tokens]), [['proj-a', 150], ['proj-b', 20]]);
  assert.deepEqual(Object.values(r.byDay), [170]);
});

test('auditTokens includeCache: cache read/write count in model, day and session counts; ranking follows', () => {
  const r = auditTokens({ src, includeCache: true });
  assert.equal(r.includeCache, true);
  assert.deepEqual(r.totals, { input: 110, output: 60, cacheRead: 1000, cacheWrite: 500 });
  assert.equal(r.byModel.m2.total, 1520);
  assert.deepEqual(r.topSessions.map((s) => [s.project, s.tokens]), [['proj-b', 1520], ['proj-a', 150]]);
  assert.deepEqual(Object.values(r.byDay), [1670]);
});

test('token-audit CLI: total line is labelled, and --include-cache adds cache to the total and the ranking', () => {
  const plain = cli().stdout;
  assert.match(plain, /^Total tokens \(excl\. cache\): 170$/m);
  assert.match(plain, /Top sessions by token usage \(excl\. cache\):\n\s+\S+\s+proj-a\s+150 tokens\n\s+\S+\s+proj-b\s+20 tokens/);
  const withCache = cli('--include-cache').stdout;
  assert.match(withCache, /^Total tokens \(incl\. cache\): 1,670$/m);
  assert.match(withCache, /Top sessions by token usage \(incl\. cache\):\n\s+\S+\s+proj-b\s+1,520 tokens\n\s+\S+\s+proj-a\s+150 tokens/);
  assert.match(withCache, /^  Cache read:\s+1,000$/m);
});

test('token-audit CLI --json: default output carries no includeCache key; --include-cache sets it', () => {
  assert.equal('includeCache' in JSON.parse(cli('--json').stdout), false);
  assert.equal(JSON.parse(cli('--json', '--include-cache').stdout).includeCache, true);
});
