import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSections, declaredStatuses, checkAgentOutput } from '../scripts/check-agent-output.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/check-agent-output.mjs', import.meta.url));
const AGENTS = new URL('../agents/', import.meta.url);

const GOOD = `### Status
DONE — all AC covered

### Review
- [x] AC 1

### Handoff
Ready for human review.
`;

const run = (args, input) => spawnSync(process.execPath, [SCRIPT, ...args], { input, encoding: 'utf8' });

test('checkAgentOutput: conforming output passes and does not halt on DONE', () => {
  assert.deepEqual(checkAgentOutput(GOOD), { ok: true, status: 'DONE', halts: false, violations: [] });
});

test('checkAgentOutput: NEEDS_REVIEW and BLOCKED are valid and halt', () => {
  for (const status of ['NEEDS_REVIEW', 'BLOCKED']) {
    const r = checkAgentOutput(GOOD.replace('DONE — all AC covered', `${status} — a concern`));
    assert.equal(r.ok, true);
    assert.equal(r.halts, true);
  }
});

test('checkAgentOutput: leading prose before Status is tolerated', () => {
  assert.equal(checkAgentOutput(`Here is my answer.\n\n${GOOD}`).ok, true);
});

test('checkAgentOutput: empty or section-less text fails and halts', () => {
  for (const text of ['', undefined, 'no headings at all']) {
    const r = checkAgentOutput(text);
    assert.equal(r.ok, false);
    assert.equal(r.halts, true);
    assert.ok(r.violations.includes('no "### " section found'));
  }
});

test('checkAgentOutput: Status must be the first section', () => {
  const r = checkAgentOutput('### Review\nx\n\n### Status\nDONE — x\n\n### Handoff\ny');
  assert.ok(r.violations.includes('first section must be "### Status"'));
});

test('checkAgentOutput: missing Handoff, misplaced Handoff, missing middle section', () => {
  assert.ok(checkAgentOutput('### Status\nDONE — x\n\n### Review\ny').violations.includes('missing "### Handoff" section'));
  assert.ok(checkAgentOutput(`${GOOD}\n### Extra\nz`).violations.includes('"### Handoff" must be the last section'));
  assert.ok(checkAgentOutput('### Status\nDONE — x\n\n### Handoff\ny').violations.includes('missing agent-specific section between Status and Handoff'));
});

test('checkAgentOutput: duplicate Status and Handoff are rejected', () => {
  const r = checkAgentOutput(`${GOOD}\n### Status\nDONE — again\n\n### Handoff\nagain`);
  assert.ok(r.violations.includes('duplicate "### Status" section'));
  assert.ok(r.violations.includes('duplicate "### Handoff" section'));
});

test('checkAgentOutput: empty sections are named', () => {
  const r = checkAgentOutput('### Status\nDONE — x\n\n### Review\n\n### Handoff\ny');
  assert.deepEqual(r.violations, ['empty section "### Review"']);
});

test('checkAgentOutput: malformed Status line, unknown value, value outside the allowed set', () => {
  const withStatus = (line) => GOOD.replace('DONE — all AC covered', line);
  assert.ok(checkAgentOutput(withStatus('DONE')).violations.includes('Status line must be "<VALUE> — <one-line summary>"'));
  assert.ok(checkAgentOutput(withStatus('[DONE | BLOCKED | NEEDS_REVIEW] — one-line summary')).violations.some((v) => v.startsWith('Status line must be')));
  assert.ok(checkAgentOutput(withStatus('MAYBE — x')).violations.includes('Status "MAYBE" is not one of DONE | BLOCKED | NEEDS_REVIEW'));
  const r = checkAgentOutput(withStatus('BLOCKED — x'), { allowed: ['DONE', 'NEEDS_REVIEW'] });
  assert.equal(r.ok, false);
  assert.equal(r.status, null);
  assert.equal(r.halts, true);
});

test('parseSections: headings inside fenced code are ignored; deeper levels stay in the body', () => {
  const s = parseSections('### Status\nDONE — x\n\n### Review\n```md\n### Handoff\n```\n#### Detail\nz\n\n### Handoff\nh');
  assert.deepEqual(s.map((x) => x.title), ['Status', 'Review', 'Handoff']);
  assert.match(s[1].body, /#### Detail/);
});

test('declaredStatuses: reads the Output block; null when absent or unknown', () => {
  assert.deepEqual(declaredStatuses('x\n### Status\n[DONE | NEEDS_REVIEW] — one-line summary'), ['DONE', 'NEEDS_REVIEW']);
  assert.equal(declaredStatuses('no status block'), null);
  assert.equal(declaredStatuses('### Status\n[DONE | MAYBE] — x'), null);
});

test('every agent definition declares a parsable Status set', () => {
  const missing = readdirSync(AGENTS).filter((f) => f.endsWith('.md') && !declaredStatuses(readFileSync(new URL(f, AGENTS), 'utf8')));
  assert.deepEqual(missing, []);
});

test('CLI: conforming stdin → exit 0 and JSON verdict', () => {
  const r = run([], GOOD);
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).status, 'DONE');
});

test('CLI: violation → exit 1 with violations on stdout', () => {
  const r = run([], '### Status\nDONE — x');
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).ok, false);
});

test('CLI: --agent restricts Status to the values the agent declares', () => {
  const blocked = GOOD.replace('DONE — all AC covered', 'BLOCKED — x');
  assert.equal(run(['--agent', 'code-reviewer'], blocked).status, 1);
  assert.equal(run(['--agent', 'code-reviewer'], GOOD).status, 0);
});

test('CLI: bad flag, bad agent name, unknown agent, missing file → Error + Usage, exit 1', () => {
  for (const args of [['--bogus'], ['--agent', '../x'], ['--agent', 'nope'], ['--agent'], ['/nonexistent/file.md']]) {
    const r = run(args, GOOD);
    assert.equal(r.status, 1, args.join(' '));
    assert.match(r.stderr, /^Error: /);
    assert.match(r.stderr, /Usage: /);
  }
});
