import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { validateCases, blockingItems, matchingItems, gradeReview } from '../scripts/eval-grade.mjs';

const DATASET = JSON.parse(readFileSync(new URL('../evals/code-reviewer/cases.json', import.meta.url), 'utf8'));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

const SHA_A = 'a'.repeat(40);
const CASE = {
  id: 'c1', source: 'PR #1', agent: 'code-reviewer', ac: ['x'], base: SHA_A, head: SHA_A, fixed_head: SHA_A,
  finding: { path: 'scripts/a.mjs', pattern: 'utf-?8|chunk', summary: 's' },
};
const review = ({ status = 'NEEDS_REVIEW', bugs = '', blocking = '', notes = '' } = {}) => `### Status
${status} — summary

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | \`npm test\` | \`ci.yml\` | PASS |

**Bugs / regressions**
${bugs || '- none'}

**Blocking issues** (must fix before merge)
${blocking || '- none'}

**Non-blocking notes** (nit)
${notes || '- none'}

### Handoff
next
`;

test('validateCases: the committed dataset is valid', () => {
  assert.deepEqual(validateCases(DATASET), []);
});

test('validateCases: names the offending field', () => {
  const bad = { ...CASE, id: 'Bad Id', source: 'PR 1', head: 'abc', ac: [], finding: { path: '-x', pattern: '(', summary: '' } };
  const errors = validateCases({ schema_version: 1, cases: [bad, { ...CASE }, { ...CASE }] });
  for (const f of ['id', 'source', 'head', 'ac', 'finding.path', 'finding.pattern', 'finding.summary']) {
    assert.ok(errors.some((e) => e.startsWith(`cases[0].${f}:`)), f);
  }
  assert.ok(errors.includes('cases[2].id: duplicate "c1"'));
});

test('validateCases: schema_version, empty and missing cases, wrong agent', () => {
  assert.ok(validateCases({ schema_version: 2, cases: [] }).includes('schema_version: must be 1'));
  assert.ok(validateCases({ schema_version: 1 }).includes('cases: must be a non-empty array'));
  assert.ok(validateCases({ schema_version: 1, cases: [{ ...CASE, agent: 'other' }] }).includes('cases[0].agent: must be "code-reviewer"'));
  assert.ok(validateCases(null).length > 0);
});

test('dataset integrity: shas resolve, base is an ancestor of head, the fix is the head child, the path is in the PR diff and touched by the fix', (t) => {
  for (const c of DATASET.cases) {
    const shas = [c.base, c.head, c.fixed_head];
    const missing = shas.filter((s) => { try { git('cat-file', '-e', `${s}^{commit}`); return false; } catch { return true; } });
    if (missing.length) {
      if (git('rev-parse', '--is-shallow-repository') === 'true') return t.skip('shallow clone: case commits not fetched');
      assert.fail(`${c.id}: commits not found ${missing.join(', ')}`);
    }
    assert.equal(git('rev-parse', `${c.fixed_head}^`), c.head, `${c.id}: fixed_head must be the child of head`);
    git('merge-base', '--is-ancestor', c.base, c.head); // throws (test fails) when base is not an ancestor of head
    assert.ok(git('diff', '--name-only', c.base, c.head).split('\n').includes(c.finding.path), `${c.id}: path not in base..head`);
    assert.ok(git('diff', '--name-only', c.head, c.fixed_head).split('\n').includes(c.finding.path), `${c.id}: fix does not touch path`);
  }
});

test('blockingItems: only Bugs and Blocking blocks; wrapped lines are joined; numbered items accepted', () => {
  const out = review({
    bugs: '- `scripts/a.mjs:10` — chunk split\n  across lines',
    blocking: '1. scripts/b.mjs — other',
    notes: '- `scripts/a.mjs` — nit about utf-8',
  });
  assert.deepEqual(blockingItems(out), ['- `scripts/a.mjs:10` — chunk split across lines', '1. scripts/b.mjs — other']);
  assert.deepEqual(blockingItems('### Status\nDONE — x\n\n### Other\nz\n\n### Handoff\nh'), []);
});

test('matchingItems: needs the path AND the pattern in the same item', () => {
  const out = review({ bugs: '- `scripts/a.mjs:3` — decodes each chunk alone\n- `scripts/b.mjs` — utf-8 issue elsewhere' });
  assert.equal(matchingItems(out, CASE.finding).length, 1);
  assert.equal(matchingItems(review({ bugs: '- `scripts/a.mjs:3` — unrelated null check' }), CASE.finding).length, 0);
});

test('gradeReview defect: flagged + NEEDS_REVIEW passes; the finding may sit in Blocking issues', () => {
  assert.equal(gradeReview(review({ bugs: '- `scripts/a.mjs:3` — chunk split' }), CASE, 'defect').pass, true);
  assert.equal(gradeReview(review({ blocking: '1. `scripts/a.mjs` — utf-8 corrupted' }), CASE, 'defect').pass, true);
});

test('gradeReview defect: miss, wrong status, non-blocking mention and broken contract fail with a reason', () => {
  const miss = gradeReview(review({ bugs: '- `scripts/b.mjs` — other' }), CASE, 'defect');
  assert.equal(miss.pass, false);
  assert.match(miss.reasons[0], /no blocking item names scripts\/a\.mjs/);
  const done = gradeReview(review({ status: 'DONE', bugs: '- `scripts/a.mjs` — chunk split' }), CASE, 'defect');
  assert.deepEqual(done.reasons, ['Status is DONE, expected NEEDS_REVIEW']);
  assert.equal(gradeReview(review({ notes: '- `scripts/a.mjs` — chunk nit' }), CASE, 'defect').pass, false);
  const broken = gradeReview('### Status\nBLOCKED — x\n\n### Review\ny\n\n### Handoff\nz', CASE, 'defect');
  assert.equal(broken.pass, false);
  assert.match(broken.reasons[0], /^contract: Status "BLOCKED"/);
});

test('gradeReview fixed: passes without the finding, fails when it is reported again, even on DONE', () => {
  assert.equal(gradeReview(review({ status: 'DONE' }), CASE, 'fixed').pass, true);
  assert.equal(gradeReview(review({ bugs: '- `scripts/b.mjs` — other' }), CASE, 'fixed').pass, true);
  const again = gradeReview(review({ bugs: '- `scripts/a.mjs` — chunk split' }), CASE, 'fixed');
  assert.equal(again.pass, false);
  assert.match(again.reasons[0], /still reports the finding/);
});

test('gradeReview: unknown variant throws', () => {
  assert.throws(() => gradeReview(review(), CASE, 'other'), /variant must be one of/);
});
