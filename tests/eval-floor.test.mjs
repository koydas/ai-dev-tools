import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fingerprint, pinsFor, checkFloor, loadInputs } from '../scripts/eval-floor.mjs';
import { summarize } from '../scripts/eval-run.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/eval-floor.mjs', import.meta.url));
const clone = (x) => JSON.parse(JSON.stringify(x));

// A small consistent world: two cases, both variants run once, floor at the pinned values.
const CASES = ['c1', 'c2'].map((id, i) => ({
  id, source: `PR #${i + 1}`, agent: 'code-reviewer', ac: ['x'], base: 'a'.repeat(40), head: 'b'.repeat(40), fixed_head: 'c'.repeat(40),
  finding: { path: 'scripts/a.mjs', pattern: 'chunk', summary: 's' },
}));
const RUNS = CASES.flatMap((c) => [{ id: c.id, variant: 'defect', pass: true }, { id: c.id, variant: 'fixed', pass: true }]);
const world = () => ({
  cases: clone(CASES),
  floor: { min_defect_rate: 0.5, min_fixed_rate: 1 },
  pins: { floor: { min_defect_rate: 0.5, min_fixed_rate: 1 }, cases: pinsFor(CASES) },
  results: { name: 'r.json', doc: { results: clone(RUNS), summary: summarize(RUNS) } },
});

test('checkFloor: a consistent world has no violation', () => {
  assert.deepEqual(checkFloor(world()), []);
});

test('fingerprint: any input change moves it; the prose summary does not', () => {
  const c = CASES[0];
  const fp = fingerprint(c);
  for (const change of [{ id: 'z' }, { source: 'PR #9' }, { ac: ['y'] }, { base: 'd'.repeat(40) }, { head: 'd'.repeat(40) }, { fixed_head: 'd'.repeat(40) }]) {
    assert.notEqual(fingerprint({ ...c, ...change }), fp, Object.keys(change)[0]);
  }
  assert.notEqual(fingerprint({ ...c, finding: { ...c.finding, path: 'x' } }), fp);
  assert.notEqual(fingerprint({ ...c, finding: { ...c.finding, pattern: 'x|chunk' } }), fp);
  assert.equal(fingerprint({ ...c, finding: { ...c.finding, summary: 'reworded' } }), fp);
});

test('checkFloor: a case that is added without a pin, removed, or changed is a violation', () => {
  const added = world();
  added.cases.push({ ...CASES[0], id: 'c3' });
  assert.match(checkFloor(added)[0], /case "c3": not pinned/);

  const removed = world();
  removed.cases.pop();
  assert.ok(checkFloor(removed).some((l) => l === 'case "c2": removed — cases only grow'));

  const loosened = world();
  loosened.cases[0].finding.pattern = 'chunk|anything|else';
  assert.match(checkFloor(loosened)[0], /case "c1": changed since it was pinned/);

  const relabelled = world();
  relabelled.cases[1].fixed_head = 'd'.repeat(40);
  assert.match(checkFloor(relabelled)[0], /case "c2": changed/);
});

test('checkFloor: the floor may rise but never fall below the pinned one; bad values are named', () => {
  const higher = world();
  higher.floor.min_defect_rate = 0.9;
  assert.deepEqual(checkFloor(higher), []);

  const lower = world();
  lower.floor.min_fixed_rate = 0.9;
  assert.deepEqual(checkFloor(lower), ['floor.min_fixed_rate: 0.9 is below the pinned 1 — thresholds only tighten']);

  for (const bad of [undefined, 'x', 2, -1, null]) {
    const w = world();
    w.floor.min_defect_rate = bad;
    assert.ok(checkFloor(w).includes('floor.min_defect_rate: must be a number in 0..1'), String(bad));
  }
});

test('checkFloor: no results file, or an empty one, is a violation', () => {
  const none = world();
  none.results = null;
  assert.match(checkFloor(none).at(-1), /^results: no evals\/results\/\*\.json/);
  const empty = world();
  empty.results.doc = { results: [] };
  assert.deepEqual(checkFloor(empty), ['r.json: has no results']);
});

test('checkFloor: results must cover every case in both variants and name no unknown case', () => {
  const partial = world();
  partial.results.doc.results = partial.results.doc.results.filter((r) => !(r.id === 'c2' && r.variant === 'fixed'));
  partial.results.doc.summary = summarize(partial.results.doc.results);
  assert.deepEqual(checkFloor(partial), ['r.json: no fixed run for case "c2" — re-run node scripts/eval-run.mjs (a floor over a subset proves nothing)']);

  const stale = world();
  stale.results.doc.results.push({ id: 'gone', variant: 'defect', pass: true });
  stale.results.doc.summary = summarize(stale.results.doc.results);
  assert.ok(checkFloor(stale).includes('r.json: results for unknown cases gone'));
});

test('checkFloor: a hand-edited summary is caught', () => {
  const w = world();
  w.results.doc.summary.defect.rate = 1;
  w.results.doc.results[0].pass = false;
  assert.match(checkFloor(w).find((l) => l.includes('summary does not match')), /recomputed/);
});

test('checkFloor: errored or denied runs are not evidence', () => {
  const errored = world();
  errored.results.doc.results[0] = { id: 'c1', variant: 'defect', error: 'boom', pass: false };
  errored.results.doc.summary = summarize(errored.results.doc.results);
  assert.ok(checkFloor(errored).includes('r.json: 1 errored defect run(s) — a results file with errors is not evidence'));

  const denied = world();
  denied.results.doc.results[1].denials = ['Bash: ls'];
  denied.results.doc.summary = summarize(denied.results.doc.results);
  assert.ok(checkFloor(denied).includes('r.json: 1 fixed run(s) had a denied tool call — a weaker review'));
});

test('checkFloor: a rate under the floor fails, at the floor passes, null fails', () => {
  const under = world();
  under.results.doc.results[0].pass = false;
  under.results.doc.results[2].pass = false;
  under.results.doc.summary = summarize(under.results.doc.results);
  assert.deepEqual(checkFloor(under), ['r.json: defect rate 0 is below the floor 0.5']);

  const at = world();
  at.results.doc.results[0].pass = false;
  at.results.doc.summary = summarize(at.results.doc.results);
  assert.deepEqual(checkFloor(at), []);

  const fixedDrop = world();
  fixedDrop.results.doc.results[1].pass = false;
  fixedDrop.results.doc.summary = summarize(fixedDrop.results.doc.results);
  assert.deepEqual(checkFloor(fixedDrop), ['r.json: fixed rate 0.5 is below the floor 1']);
});

test('the committed dataset, floor and newest results hold the floor', () => {
  assert.deepEqual(checkFloor(loadInputs()), []);
});

test('the committed floor is not below the pinned floor, and every committed case is pinned', () => {
  const { cases, floor, pins } = loadInputs();
  assert.deepEqual(Object.keys(pins.cases).sort(), cases.map((c) => c.id).sort());
  for (const k of ['min_defect_rate', 'min_fixed_rate']) assert.ok(floor[k] >= pins.floor[k], k);
});

test('CLI: exit 0 and a one-line verdict when the floor holds; --print-pins prints every case; bad flag exits 1', () => {
  const ok = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /eval floor holds/);
  const pins = spawnSync(process.execPath, [SCRIPT, '--print-pins'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(pins.stdout), loadInputs().pins.cases);
  const bad = spawnSync(process.execPath, [SCRIPT, '--bogus'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /^Error: unknown option/);
});
