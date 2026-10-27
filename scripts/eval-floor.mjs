#!/usr/bin/env node
// Floor for the code-reviewer eval (ADR-0031 of autonomous-dev-loop, same idea): an eval is never made to pass by
// editing the eval. Violations → stderr, exit 1.
// Usage: node scripts/eval-floor.mjs [--print-pins]
//   (none)       check evals/code-reviewer/cases.json, floor.json and the newest evals/results/*.json against
//                tests/fixtures/eval-floor.json (the pins)
//   --print-pins print the pins for the current cases, to paste into the fixture when a case is added
// Rules: every case is pinned and keeps its pin (id, inputs, finding path and pattern are immutable; cases are
// never removed); floor.json never goes below the pinned floor; the newest committed results cover every case in
// both variants, carry no errored or denied run, a summary equal to the one recomputed from the runs, and rates
// at or above the floor. "Newest" = latest `generated` timestamp, not the file name; a results file that is not
// valid JSON or has no valid `generated` is itself a violation, so none can sit outside the check. Node ≥ 20, no external dependencies

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize } from './eval-run.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FLOOR_KEYS = ['min_defect_rate', 'min_fixed_rate'];
const PIN_HINT = 'node scripts/eval-floor.mjs --print-pins';

// Pure: what makes a case the same case. `finding.summary` is prose and may be reworded.
export function fingerprint(c) {
  const parts = [c.id, c.source, c.ac, c.base, c.head, c.fixed_head, c.finding?.path, c.finding?.pattern];
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}

export function pinsFor(cases) {
  return Object.fromEntries(cases.map((c) => [c.id, fingerprint(c)]));
}

const isRate = (v) => typeof v === 'number' && v >= 0 && v <= 1;

// Pure: the results file to check — latest `generated`, ties broken by name — or null.
export function newestResults(files) {
  const stamped = files.filter((f) => Number.isFinite(Date.parse(f.doc?.generated)));
  return stamped.sort((a, b) => Date.parse(a.doc.generated) - Date.parse(b.doc.generated) || a.name.localeCompare(b.name)).at(-1) ?? null;
}

// Pure: { cases, pins: { cases, floor }, floor, results: [{ name, doc }] } → violations (empty when clean).
export function checkFloor({ cases, pins, floor, results: files }) {
  const v = [];
  const live = new Map(cases.map((c) => [c.id, c]));

  for (const c of cases) {
    if (!(c.id in pins.cases)) v.push(`case "${c.id}": not pinned — add its fingerprint to tests/fixtures/eval-floor.json (${PIN_HINT})`);
    else if (pins.cases[c.id] !== fingerprint(c)) v.push(`case "${c.id}": changed since it was pinned — id, inputs, finding path and pattern are immutable; a wrong label is corrected in its own PR, then the pin is updated`);
  }
  for (const id of Object.keys(pins.cases)) if (!live.has(id)) v.push(`case "${id}": removed — cases only grow`);

  for (const k of FLOOR_KEYS) {
    if (!isRate(floor?.[k])) v.push(`floor.${k}: must be a number in 0..1`);
    else if (floor[k] < pins.floor[k]) v.push(`floor.${k}: ${floor[k]} is below the pinned ${pins.floor[k]} — thresholds only tighten`);
  }

  for (const f of files) {
    if (f.doc === null) v.push(`${f.name}: not valid JSON`);
    else if (!Number.isFinite(Date.parse(f.doc?.generated))) v.push(`${f.name}: missing or invalid "generated" timestamp`);
  }
  const newest = newestResults(files);
  if (!newest) return [...v, 'results: no evals/results/*.json — run node scripts/eval-run.mjs and commit the file'];
  const { name, doc } = newest;
  const rs = Array.isArray(doc?.results) ? doc.results : [];
  if (!rs.length) return [...v, `${name}: has no results`];

  const stale = [...new Set(rs.map((r) => r.id).filter((id) => !live.has(id)))];
  if (stale.length) v.push(`${name}: results for unknown cases ${stale.join(', ')}`);
  for (const c of cases) {
    for (const variant of ['defect', 'fixed']) {
      if (!rs.some((r) => r.id === c.id && r.variant === variant)) v.push(`${name}: no ${variant} run for case "${c.id}" — re-run node scripts/eval-run.mjs (a floor over a subset proves nothing)`);
    }
  }
  const actual = summarize(rs);
  if (JSON.stringify(doc.summary) !== JSON.stringify(actual)) v.push(`${name}: summary does not match its runs (recomputed ${JSON.stringify(actual)})`);
  for (const variant of ['defect', 'fixed']) {
    const s = actual[variant];
    if (!s) continue;
    if (s.errored) v.push(`${name}: ${s.errored} errored ${variant} run(s) — a results file with errors is not evidence`);
    if (s.denied) v.push(`${name}: ${s.denied} ${variant} run(s) had a denied tool call — a weaker review`);
    const min = floor?.[`min_${variant}_rate`];
    if (isRate(min) && !(s.rate >= min)) v.push(`${name}: ${variant} rate ${s.rate} is below the floor ${min}`);
  }
  return v;
}

export function loadInputs(root = ROOT) {
  const json = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
  const dir = join(root, 'evals/results');
  const results = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    try { return { name: `evals/results/${f}`, doc: json(`evals/results/${f}`) }; } catch { return { name: `evals/results/${f}`, doc: null }; }
  });
  return {
    cases: json('evals/code-reviewer/cases.json').cases,
    floor: json('evals/code-reviewer/floor.json'),
    pins: json('tests/fixtures/eval-floor.json'),
    results,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((a) => a !== '--print-pins')) {
    console.error('Error: unknown option\nUsage: node scripts/eval-floor.mjs [--print-pins]');
    process.exit(1);
  }
  try {
    const inputs = loadInputs();
    if (args.length) {
      console.log(JSON.stringify(pinsFor(inputs.cases), null, 2));
      process.exit(0);
    }
    const violations = checkFloor(inputs);
    for (const line of violations) console.error(line);
    console.log(violations.length ? `${violations.length} violation(s)` : 'eval floor holds');
    process.exit(violations.length ? 1 : 0);
  } catch (err) {
    console.error(`Error: ${err.message}\nUsage: node scripts/eval-floor.mjs [--print-pins]`);
    process.exit(1);
  }
}
