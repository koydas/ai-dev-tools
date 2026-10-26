import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseArgs, stripFrontmatter, buildPrompt, buildClaudeArgs, extractReview, parseClaudeResult,
  summarize, prepareCheckout, runOnce, selectCases,
} from '../scripts/eval-run.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/eval-run.mjs', import.meta.url));
const DATASET = JSON.parse(readFileSync(new URL('../evals/code-reviewer/cases.json', import.meta.url), 'utf8'));
const CASE = {
  id: 'c1', source: 'PR #1', agent: 'code-reviewer', ac: ['do x', 'do y'], base: 'b'.repeat(40), head: 'a'.repeat(40), fixed_head: 'f'.repeat(40),
  finding: { path: 'scripts/a.mjs', pattern: 'chunk', summary: 's' },
};
const OPTS = { model: null, effort: null, budget: 3, timeoutMin: 1 };
const REVIEW = (bugs) => `### Status\nNEEDS_REVIEW — x\n\n### Review\n\n**Bugs / regressions**\n${bugs}\n\n### Handoff\nh`;
const claudeJson = (result, extra = {}) => JSON.stringify({ result, total_cost_usd: 0.5, duration_ms: 1200, modelUsage: { 'claude-x': {} }, ...extra });
// Fake process runner: git always succeeds, `claude` answers with `reply`.
const fakeExec = (reply) => (cmd) => (cmd === 'git' ? { status: 0, stdout: '', stderr: '' } : reply);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

test('parseArgs: defaults', () => {
  const o = parseArgs([], '2026-01-02');
  assert.deepEqual([o.variants, o.runs, o.timeoutMin, o.budget, o.model, o.dryRun], [['defect', 'fixed'], 1, 15, 3, null, false]);
  assert.match(o.out, /evals\/results\/2026-01-02-code-reviewer\.json$/);
  assert.match(o.rawDir, /evals\/results\/raw\/2026-01-02$/);
});

test('parseArgs: values are applied', () => {
  const o = parseArgs(['--variant', 'fixed', '--runs', '3', '--case', 'pr27-utf8-split-chunks', '--model', 'claude-opus-5-5', '--effort', 'high', '--dry-run']);
  assert.deepEqual([o.variants, o.runs, o.caseId, o.model, o.effort, o.dryRun], [['fixed'], 3, 'pr27-utf8-split-chunks', 'claude-opus-5-5', 'high', true]);
});

test('parseArgs: every bad value names its flag', () => {
  for (const [args, re] of [
    [['--runs', '0'], /--runs/], [['--runs', '11'], /--runs/], [['--runs', 'x'], /--runs/], [['--timeout-min', '61'], /--timeout-min/],
    [['--max-budget-usd', '0'], /--max-budget-usd/], [['--max-budget-usd', '21'], /--max-budget-usd/], [['--variant', 'x'], /--variant/],
    [['--case', '../x'], /--case/], [['--model', '-x'], /--model/], [['--effort', 'x'], /--effort/], [['--runs'], /requires a value/], [['stray'], /unexpected argument/],
  ]) assert.throws(() => parseArgs(args), re, args.join(' '));
});

test('stripFrontmatter removes the YAML block only', () => {
  assert.equal(stripFrontmatter('---\nname: a\n---\n\n# body\n'), '# body');
  assert.equal(stripFrontmatter('# no frontmatter'), '# no frontmatter');
});

test('buildPrompt: base, every AC, no-CI and output instructions', () => {
  const p = buildPrompt(CASE);
  assert.ok(p.includes(`git diff ${CASE.base} HEAD`));
  assert.ok(p.includes('- do x') && p.includes('- do y'));
  assert.match(p, /No base CI results are available/);
});

test('buildClaudeArgs: no Write/Edit tool, Bash allowed, optional model and effort', () => {
  const a = buildClaudeArgs({ prompt: 'p', systemPrompt: 's', budget: 3 });
  assert.equal(a[a.indexOf('--tools') + 1], 'Read,Grep,Glob,Bash');
  assert.ok(a.includes('bypassPermissions') && a.includes('--no-session-persistence'));
  assert.ok(!a.includes('--allowedTools'));
  assert.ok(!a[a.indexOf('--tools') + 1].split(',').some((t) => /^(Write|Edit|NotebookEdit)$/.test(t)));
  assert.ok(!a.includes('--model') && !a.includes('--effort'));
  const b = buildClaudeArgs({ prompt: 'p', systemPrompt: 's', budget: 3, model: 'm', effort: 'low' });
  assert.deepEqual([b[b.indexOf('--model') + 1], b[b.indexOf('--effort') + 1]], ['m', 'low']);
});

test('extractReview: drops prose before ### Status; unchanged when absent', () => {
  assert.equal(extractReview('Sure.\n\n### Status\nDONE — x\n\n### Handoff\nh'), '### Status\nDONE — x\n\n### Handoff\nh');
  assert.equal(extractReview('no block'), 'no block');
  assert.equal(extractReview(undefined), '');
});

test('parseClaudeResult: fields, error subtype, invalid JSON throws', () => {
  assert.deepEqual(parseClaudeResult(claudeJson('t')), { text: 't', isError: false, costUsd: 0.5, durationMs: 1200, models: ['claude-x'], denials: [] });
  const d = parseClaudeResult(claudeJson('t', { permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'cd /x && git diff' } }, {}] }));
  assert.deepEqual(d.denials, ['Bash: cd /x && git diff', '?: ']);
  assert.equal(parseClaudeResult(claudeJson('t', { is_error: true })).isError, true);
  assert.equal(parseClaudeResult(claudeJson('', { subtype: 'error_max_budget_usd' })).isError, true);
  assert.throws(() => parseClaudeResult('not json'));
});

test('summarize: rate per variant over graded runs; errored runs leave the rate; cost summed', () => {
  const s = summarize([
    { variant: 'defect', pass: true, cost_usd: 1 }, { variant: 'defect', pass: false, cost_usd: 0.5, denials: [] },
    { variant: 'defect', pass: false, error: 'boom' }, { variant: 'fixed', pass: true, cost_usd: 0.25 },
  ]);
  assert.deepEqual(s.defect, { runs: 3, passed: 1, errored: 1, denied: 0, rate: 0.5 });
  assert.deepEqual(s.fixed, { runs: 1, passed: 1, errored: 0, denied: 0, rate: 1 });
  assert.equal(s.cost_usd, 1.75);
  assert.equal(summarize([{ variant: 'defect', error: 'x' }]).defect.rate, null);
  assert.deepEqual(summarize([]), { cost_usd: 0 });
});

test('selectCases: filters by id, throws on an unknown id', () => {
  assert.equal(selectCases([CASE, { ...CASE, id: 'c2' }], 'c2').length, 1);
  assert.equal(selectCases([CASE], null).length, 1);
  assert.throws(() => selectCases([CASE], 'nope'), /no case "nope"/);
});

test('runOnce: a defect found passes and carries cost, status and the raw review', () => {
  const r = runOnce(CASE, 'defect', OPTS, 'sys', fakeExec({ status: 0, stdout: claudeJson(REVIEW('- `scripts/a.mjs:1` — chunk split')), stderr: '' }));
  assert.equal(r.pass, true);
  assert.deepEqual([r.status, r.cost_usd, r.models, r.error], ['NEEDS_REVIEW', 0.5, ['claude-x'], undefined]);
  assert.match(r.raw, /^### Status/);
});

test('runOnce: permission denials are kept on the record', () => {
  const r = runOnce(CASE, 'defect', OPTS, 's', fakeExec({ status: 0, stdout: claudeJson(REVIEW('- none'), { permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'ls' } }] }), stderr: '' }));
  assert.deepEqual(r.denials, ['Bash: ls']);
  assert.equal(summarize([r]).defect.denied, 1);
});

test('runOnce: a miss and a contract violation fail with a reason, they are not errors', () => {
  const miss = runOnce(CASE, 'defect', OPTS, 'sys', fakeExec({ status: 0, stdout: claudeJson(REVIEW('- `scripts/b.mjs` — other')), stderr: '' }));
  assert.deepEqual([miss.pass, miss.error], [false, undefined]);
  const bad = runOnce(CASE, 'fixed', OPTS, 'sys', fakeExec({ status: 0, stdout: claudeJson('I found nothing.'), stderr: '' }));
  assert.deepEqual([bad.pass, bad.error], [false, undefined]);
  assert.match(bad.reasons[0], /^contract: /);
});

test('runOnce: claude failure, timeout, error result, bad JSON and git failure are recorded as errors', () => {
  const cases = [
    [fakeExec({ status: 1, stdout: '', stderr: 'auth failed\nmore' }), /claude exited 1: auth failed/],
    [fakeExec({ status: null, error: { code: 'ETIMEDOUT' }, stdout: '', stderr: '' }), /timeout after 1 min/],
    [fakeExec({ status: 0, stdout: claudeJson('', { is_error: true }), stderr: '' }), /claude reported an error/],
    [fakeExec({ status: 0, stdout: 'garbage', stderr: '' }), /JSON/],
    [(cmd) => (cmd === 'git' ? { status: 128, stdout: '', stderr: 'fatal: nope\n' } : null), /git init failed: fatal: nope/],
  ];
  for (const [exec, re] of cases) {
    const r = runOnce(CASE, 'defect', OPTS, 'sys', exec);
    assert.equal(r.pass, false);
    assert.match(r.error, re);
  }
});

test('runOnce: defect reviews head, fixed reviews fixed_head', () => {
  const seen = [];
  const exec = (cmd, args) => { if (cmd === 'git' && args[0] === 'checkout') seen.push(args.at(-1)); return cmd === 'git' ? { status: 0, stdout: '', stderr: '' } : { status: 1, stdout: '', stderr: '' }; };
  runOnce(CASE, 'defect', OPTS, 's', exec);
  runOnce(CASE, 'fixed', OPTS, 's', exec);
  assert.deepEqual(seen, [CASE.head, CASE.fixed_head]);
});

test('prepareCheckout: only the reviewed commit and its ancestors exist (the fix is not reachable)', (t) => {
  const c = DATASET.cases[0];
  try { git('cat-file', '-e', `${c.fixed_head}^{commit}`); } catch { return t.skip('case commits not fetched'); }
  const dir = mkdtempSync(join(tmpdir(), 'eval-test-'));
  try {
    prepareCheckout(c.head, dir);
    const inDir = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    assert.equal(inDir('rev-parse', 'HEAD'), c.head);
    assert.doesNotThrow(() => inDir('diff', '--name-only', c.base, 'HEAD'));
    assert.throws(() => inDir('cat-file', '-e', `${c.fixed_head}^{commit}`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const cli = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

test('CLI: --dry-run prints the plan and calls nothing', () => {
  const r = cli(['--dry-run', '--variant', 'defect', '--runs', '2']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^24 run\(s\): 12 case\(s\) × defect × 2/);
});

test('CLI: bad flag, bad value, unknown case and invalid cases file exit 1 with Error + Usage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-cli-'));
  try {
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ schema_version: 1, cases: [{ id: 'X' }] }));
    for (const args of [['--bogus'], ['--runs', '99'], ['--case', 'nope'], ['--cases', bad], ['--cases', join(dir, 'missing.json')]]) {
      const r = cli(args);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, /^Error: /);
      assert.match(r.stderr, /Usage: /);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
