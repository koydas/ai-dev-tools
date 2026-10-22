import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  escapeHtml, formatDate, validateObservationSet, loadLatestSet, summarize, renderOverview, renderObservations, renderEvals, buildDashboard, parseArgs, formatRate, REVIEW_CHAIN, SMALL_SAMPLE,
} from '../scripts/build-dashboard.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/build-dashboard.mjs', import.meta.url));
const REAL_DIR = fileURLToPath(new URL('../docs/observations', import.meta.url));

const obs = (id, status, extra = {}) => ({ id, title: `T ${id}`, summary: `S ${id}`, status, date: '2026-10-22', ...extra });
const set = (over = {}) => ({
  schema_version: 1, date: '2026-10-22', tests: { passed: 10, total: 10 },
  observations: [obs('O1', 'fixed'), obs('O2', 'open'), obs('O3', 'unverified'), obs('O4', 'not_applicable'), obs('O5', 'fixed')],
  ...over,
});
const tmp = () => mkdtempSync(join(tmpdir(), 'dash-'));

test('escapeHtml: escapes the five markup characters, null → empty', () => {
  assert.equal(escapeHtml(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
});

test('formatDate: ISO → "Oct 22, 2026"; non-ISO and bad month returned as is', () => {
  assert.equal(formatDate('2026-10-22'), 'Oct 22, 2026');
  assert.equal(formatDate('2026-13-01'), '2026-13-01');
  assert.equal(formatDate('soon'), 'soon');
});

test('validateObservationSet: accepts a valid set and the committed sidecars', () => {
  assert.equal(validateObservationSet(set()).tests.total, 10);
  assert.ok(loadLatestSet(REAL_DIR));
});

for (const [name, mutate, path] of [
  ['non-object', () => [], '$'],
  ['wrong schema_version', (s) => ({ ...s, schema_version: 2 }), 'schema_version'],
  ['bad date', (s) => ({ ...s, date: '22/10/2026' }), 'date'],
  ['tests missing', (s) => ({ ...s, tests: null }), 'tests'],
  ['tests.passed negative', (s) => ({ ...s, tests: { passed: -1, total: 3 } }), 'tests.passed'],
  ['tests.total fractional', (s) => ({ ...s, tests: { passed: 1, total: 1.5 } }), 'tests.total'],
  ['passed > total', (s) => ({ ...s, tests: { passed: 5, total: 4 } }), 'tests.passed'],
  ['observations not array', (s) => ({ ...s, observations: {} }), 'observations'],
  ['observation not object', (s) => ({ ...s, observations: [null] }), 'observations[0]'],
  ['observation empty id', (s) => ({ ...s, observations: [obs(' ', 'fixed')] }), 'observations[0].id'],
  ['duplicate id', (s) => ({ ...s, observations: [obs('O1', 'fixed'), obs('O1', 'open')] }), 'observations[1].id'],
  ['empty title', (s) => ({ ...s, observations: [obs('O1', 'fixed', { title: '' })] }), 'observations[0].title'],
  ['summary not string', (s) => ({ ...s, observations: [obs('O1', 'fixed', { summary: 3 })] }), 'observations[0].summary'],
  ['unknown status', (s) => ({ ...s, observations: [obs('O1', 'done')] }), 'observations[0].status'],
  ['status "toString" (prototype key)', (s) => ({ ...s, observations: [obs('O1', 'toString')] }), 'observations[0].status'],
  ['bad observation date', (s) => ({ ...s, observations: [obs('O1', 'fixed', { date: 'x' })] }), 'observations[0].date'],
]) {
  test(`validateObservationSet: rejects ${name}, naming ${path}`, () => {
    assert.throws(() => validateObservationSet(mutate(set()), 'f.json'), (err) => err.message.startsWith('f.json: ' + path + ' '));
  });
}

test('loadLatestSet: newest date wins, non-json files ignored, empty dir → null', () => {
  const dir = tmp();
  try {
    assert.equal(loadLatestSet(dir), null);
    writeFileSync(join(dir, 'a.json'), JSON.stringify(set({ date: '2026-10-01' })));
    writeFileSync(join(dir, 'b.json'), JSON.stringify(set({ date: '2026-10-22' })));
    writeFileSync(join(dir, 'notes.md'), 'ignored');
    assert.equal(loadLatestSet(dir).date, '2026-10-22');
  } finally { rmSync(dir, { recursive: true }); }
});

test('loadLatestSet: invalid JSON and invalid schema name the file', () => {
  const dir = tmp();
  try {
    writeFileSync(join(dir, 'bad.json'), '{');
    assert.throws(() => loadLatestSet(dir), /^Error: bad\.json: invalid JSON/);
    writeFileSync(join(dir, 'bad.json'), JSON.stringify(set({ date: 'x' })));
    assert.throws(() => loadLatestSet(dir), /bad\.json: date/);
  } finally { rmSync(dir, { recursive: true }); }
});

test('summarize: counts, open first, overview capped at 4', () => {
  const m = summarize(set());
  assert.equal(m.fixed, 2);
  assert.equal(m.others, 3);
  assert.deepEqual(m.all.map((o) => o.id), ['O2', 'O3', 'O1', 'O5', 'O4']);
  assert.equal(m.followUp.length, 4);
  assert.equal(m.evidence, null);
});

test('renderOverview: tiles, failing tests, singular "other", evidence counts', () => {
  const html = renderOverview(summarize(set({ tests: { passed: 8, total: 10 }, observations: [obs('O1', 'fixed'), obs('O2', 'open')], review_evidence: { PASS: 7 } })));
  assert.match(html, /8 \/ 10/);
  assert.match(html, /2 failing/);
  assert.match(html, /1 other not conclusive/);
  assert.match(html, /Not instrumented/);
  assert.match(html, /Check ran and passed\. <b>7<\/b>/);
  assert.match(html, /aria-current="page">Overview/);
  assert.match(renderOverview(summarize(set())), /All passing/);
  assert.match(renderOverview(summarize(set())), /3 others not conclusive/);
});

test('renderers: sidecar strings are escaped', () => {
  const m = summarize(set({ observations: [obs('O1', 'open', { title: '<img src=x onerror=1>', summary: '<script>alert(1)</script>' })], source: '"><u>pwn' }));
  for (const html of [renderOverview(m), renderObservations(m), renderEvals(m)]) {
    assert.doesNotMatch(html, /<img src|<script>|<u>pwn/);
  }
  assert.match(renderObservations(m), /&lt;img src=x onerror=1&gt;/);
});

test('layout: top nav and bottom tab bar both list the three pages, current page marked in each', () => {
  const m = summarize(set());
  for (const [html, file] of [[renderOverview(m), 'index.html'], [renderObservations(m), 'observations.html'], [renderEvals(m), 'evals.html']]) {
    const tabbar = /<nav class="tabbar"[^>]*>(.*?)<\/nav>/s.exec(html)[1];
    assert.equal((tabbar.match(/<a href=/g) ?? []).length, 3);
    assert.equal((tabbar.match(/aria-current="page"/g) ?? []).length, 1);
    assert.match(tabbar, new RegExp(`<a href="${file}" aria-current="page">`));
    assert.equal((html.match(/<a href="[^"]+" aria-current="page">/g) ?? []).length, 2);
  }
});

test('renderers: no script, no external asset; observations lists every row; evals is explicit about missing data', () => {
  const m = summarize(set());
  const all = renderOverview(m) + renderObservations(m) + renderEvals(m);
  assert.doesNotMatch(all, /<script|<link|src="http/);
  assert.equal((renderObservations(m).match(/<tr><td>O/g) ?? []).length, 5);
  assert.match(renderEvals(m), /Not instrumented/);
});

test('buildDashboard: writes the three pages; no sidecar → error', () => {
  const src = tmp();
  const out = join(tmp(), 'nested');
  try {
    assert.throws(() => buildDashboard({ observationsDir: src, outDir: out }), /no observation sidecar/);
    writeFileSync(join(src, 'a.json'), JSON.stringify(set()));
    assert.deepEqual(buildDashboard({ observationsDir: src, outDir: out }), ['index.html', 'observations.html', 'evals.html']);
    assert.ok(existsSync(join(out, 'evals.html')));
    assert.match(readFileSync(join(out, 'index.html'), 'utf8'), /^<!doctype html>/);
  } finally { rmSync(src, { recursive: true }); rmSync(out, { recursive: true, force: true }); }
});

test('parseArgs: defaults, overrides, unknown flag, missing value, flag as value', () => {
  assert.match(parseArgs([]).out, /_site$/);
  assert.equal(parseArgs(['--out', '/x']).out, '/x');
  assert.equal(parseArgs(['--observations', '/o', '--out', '/x']).observations, '/o');
  assert.throws(() => parseArgs(['--bogus']), /unknown option --bogus/);
  assert.throws(() => parseArgs(['--out']), /--out needs a value/);
  assert.throws(() => parseArgs(['--out', '--observations']), /--out needs a value/);
});

test('CLI: builds from the committed sidecars; bad flag → Error + Usage, exit 1', () => {
  const out = join(tmp(), 'site');
  try {
    const ok = spawnSync(process.execPath, [SCRIPT, '--out', out], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    const { tests } = loadLatestSet(REAL_DIR);
    assert.ok(readFileSync(join(out, 'index.html'), 'utf8').includes(`${tests.passed} / ${tests.total}`));
    const bad = spawnSync(process.execPath, [SCRIPT, '--bogus'], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /^Error: unknown option --bogus\nUsage: /);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

const chain = (over = {}) => ({
  generated: '2026-10-22', scope: 'o/r, 30 latest closed PRs',
  aggregate: { prs: 30, reviewed: 12, reports: 18, blocking_touched_rate: 0.75, non_blocking_touched_rate: 0.5, converged_rate: 0.667, mean_rounds: 1.5, human_threads_after_review: 4, human_threads_beyond_review: 1, ...over },
});

test('formatRate: ratio → percent with one decimal at most, null → n/a', () => {
  assert.equal(formatRate(0.5), '50%');
  assert.equal(formatRate(0.667), '66.7%');
  assert.equal(formatRate(0), '0%');
  assert.equal(formatRate(null), 'n/a');
});

for (const [name, mutate, path] of [
  ['review_chain not an object', (x) => { x.review_chain = []; }, 'review_chain'],
  ['generated not a date', (x) => { x.review_chain.generated = 'today'; }, 'review_chain.generated'],
  ['empty scope', (x) => { x.review_chain.scope = ' '; }, 'review_chain.scope'],
  ['aggregate missing', (x) => { delete x.review_chain.aggregate; }, 'review_chain.aggregate'],
  ['count not an integer', (x) => { x.review_chain.aggregate.reports = 1.5; }, 'review_chain.aggregate.reports'],
  ['reviewed above prs', (x) => { x.review_chain.aggregate.reviewed = 31; }, 'review_chain.aggregate.reviewed'],
  ['beyond above after', (x) => { x.review_chain.aggregate.human_threads_beyond_review = 5; }, 'review_chain.aggregate.human_threads_beyond_review'],
  ['rate above 1', (x) => { x.review_chain.aggregate.converged_rate = 1.2; }, 'review_chain.aggregate.converged_rate'],
  ['rate not a number', (x) => { x.review_chain.aggregate.blocking_touched_rate = '50%'; }, 'review_chain.aggregate.blocking_touched_rate'],
  ['negative mean_rounds', (x) => { x.review_chain.aggregate.mean_rounds = -1; }, 'review_chain.aggregate.mean_rounds'],
]) {
  test(`validateObservationSet: ${name} → error names ${path}`, () => {
    const x = set({ review_chain: chain() });
    mutate(x);
    assert.throws(() => validateObservationSet(x, 'f.json'), (err) => err.message.startsWith(`f.json: ${path} `));
  });
}

test('validateObservationSet: review_chain is optional; null rates (unknown) are accepted', () => {
  assert.ok(validateObservationSet(set()));
  assert.ok(validateObservationSet(set({ review_chain: chain({ blocking_touched_rate: null, non_blocking_touched_rate: null, converged_rate: null, mean_rounds: null }) })));
});

test('renderEvals: without review_chain the page has no review-chain section', () => {
  assert.doesNotMatch(renderEvals(summarize(set())), /Review chain/);
  assert.doesNotMatch(renderOverview(summarize(set())), /Review chain/);
});

test('renderEvals: review chain figures, definitions, scope and the proxy caveat', () => {
  const html = renderEvals(summarize(set({ review_chain: chain() })));
  assert.match(html, /Not instrumented/);
  assert.match(html, /12 of 30 PRs carry a report, 18 reports in all/);
  assert.match(html, /o\/r, 30 latest closed PRs/);
  for (const x of REVIEW_CHAIN) assert.match(html, new RegExp(x.label));
  assert.match(html, /<b>75%<\/b>/);
  assert.match(html, /<b>1\.5<\/b>/);
  assert.match(html, /not eval scores/);
  assert.doesNotMatch(html, /too few to read a rate/);
});

test('renderEvals: below SMALL_SAMPLE reviewed PRs the page says a rate cannot be read; null shows n/a', () => {
  const html = renderEvals(summarize(set({ review_chain: chain({ reviewed: SMALL_SAMPLE - 1, reports: 1, blocking_touched_rate: null }) })));
  assert.match(html, new RegExp(`Only ${SMALL_SAMPLE - 1} reviewed PRs: too few to read a rate`));
  assert.match(html, /<b>n\/a<\/b>/);
  assert.match(renderEvals(summarize(set({ review_chain: chain({ reviewed: 1, reports: 1 }) }))), /Only 1 reviewed PR: too few/);
});

test('renderOverview: review chain card shows reviewed / sampled PRs and links to the evals page', () => {
  const html = renderOverview(summarize(set({ review_chain: chain() })));
  assert.match(html, /Review chain<\/div><div class="big">12 \/ 30<\/div>/);
  assert.match(html, /href="evals\.html">observational figures/);
});

test('renderers: review_chain strings are escaped', () => {
  const m = summarize(set({ review_chain: chain({}) }));
  m.reviewChain.scope = '<img src=x onerror=1>';
  assert.doesNotMatch(renderEvals(m), /<img src/);
  assert.match(renderEvals(m), /&lt;img src=x onerror=1&gt;/);
});
