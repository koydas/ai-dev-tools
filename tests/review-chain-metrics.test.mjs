import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { asMember, parseFinding, parseReport, summarizeChecks, afterCount, buildRecord, aggregate } from '../scripts/review-chain-metrics.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/review-chain-metrics.mjs', import.meta.url));

const report = (status, sha, { blocking = [], nonBlocking = [], evidence = [] } = {}) => `### Status
${status} — summary

### Review

**PR**: #7 — Title
**Branch**: feat → main @ ${sha}
**Author**: dev

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
${evidence.map((r, i) => `| C${i} | \`cmd\` | \`ci.yml\` | ${r} |`).join('\n')}

**Risk assessment**
- Low — fine

**Blocking issues**
${blocking.map((b, i) => `${i + 1}. ${b}`).join('\n') || 'None'}

**Non-blocking suggestions**
${nonBlocking.map((b) => `- ${b}`).join('\n') || 'None'}

**Test coverage**
- [x] ok

### Handoff
Report written.
`;

const B1 = '**[High · introduced]** `src/a.mjs:10` — null deref';
const N1 = '**[Medium · amplified]** `src/b.mjs:5` — leak';
const N2 = '**[Low · introduced · nit]** `docs/c.md:1` — typo';

test('parseFinding: severity, origin, nit flag, path and line', () => {
  assert.deepEqual(parseFinding(`1. ${B1}`), { severity: 'high', origin: 'introduced', nit: false, path: 'src/a.mjs', line: 10 });
  assert.deepEqual(parseFinding(`- ${N2}`), { severity: 'low', origin: 'introduced', nit: true, path: 'docs/c.md', line: 1 });
});

test('parseFinding: path without line → line null; non-finding lines → null', () => {
  assert.equal(parseFinding('- **[Low · pre-existing]** `x.js` — y').line, null);
  assert.equal(parseFinding('None'), null);
  assert.equal(parseFinding('- [x] covered'), null);
});

test('parseReport: status, head sha, findings and evidence tallies', () => {
  const r = parseReport(report('NEEDS_REVIEW', 'abc1234', {
    blocking: [B1], nonBlocking: [N1, N2], evidence: ['PASS — 42/42', 'FAIL — 2 errors', 'N/A — none', 'NOT_RUN — HEAD', 'PRE_EXISTING — base'],
  }));
  assert.equal(r.status, 'NEEDS_REVIEW');
  assert.equal(r.headSha, 'abc1234');
  assert.equal(r.blocking.length, 1);
  assert.equal(r.nonBlocking.length, 2);
  assert.deepEqual(r.evidence, { PASS: 1, FAIL: 1, NOT_RUN: 1, PRE_EXISTING: 1, 'N/A': 1 });
});

test('parseReport: "None" sections → empty lists; missing Branch → headSha null; missing Status throws', () => {
  const r = parseReport(report('DONE', 'abc1234').replace(/\*\*Branch\*\*:.*\n/, ''));
  assert.deepEqual([r.blocking, r.nonBlocking, r.headSha], [[], [], null]);
  assert.throws(() => parseReport('no status here'), /no ### Status/);
});

test('summarizeChecks: buckets conclusions; non-array → null', () => {
  assert.deepEqual(summarizeChecks([{ conclusion: 'success' }, { conclusion: 'skipped' }, { conclusion: 'failure' }, { conclusion: null }]), { success: 2, failure: 1, other: 1 });
  assert.equal(summarizeChecks(null), null);
});

test('afterCount: commits after a sha (prefix match); unknown sha → null', () => {
  const commits = [{ sha: 'aaa1111xx' }, { sha: 'bbb2222xx' }, { sha: 'ccc3333xx' }];
  assert.equal(afterCount(commits, 'aaa1111'), 2);
  assert.equal(afterCount(commits, 'ccc3333'), 0);
  assert.equal(afterCount(commits, 'zzz9999'), null);
  assert.equal(afterCount(commits, null), null);
});

const trustedUser = { type: 'User', association: 'OWNER', login: 'dev' };
const prInfo = { number: 7, state: 'closed', merged: true, headSha: 'ccc3333xx', createdAt: '2026-10-01T00:00:00Z', mergedAt: '2026-10-01T12:00:00Z' };
const commits = [{ sha: 'aaa1111xx' }, { sha: 'bbb2222xx' }, { sha: 'ccc3333xx' }];

test('buildRecord: two rounds, touched files, human thread beyond review, CI on head', () => {
  const rec = buildRecord({
    pr: prInfo,
    comments: [
      { id: 1, ...trustedUser, createdAt: '2026-10-01T01:00:00Z', body: report('NEEDS_REVIEW', 'aaa1111', { blocking: [B1], nonBlocking: [N1, N2] }) },
      { id: 2, ...trustedUser, createdAt: '2026-10-01T05:00:00Z', body: report('DONE', 'bbb2222') },
      { id: 3, ...trustedUser, createdAt: '2026-10-01T06:00:00Z', body: 'looks fine' },
    ],
    threads: [
      { path: 'src/a.mjs', ...trustedUser, createdAt: '2026-10-01T07:00:00Z' },
      { path: 'src/other.mjs', ...trustedUser, createdAt: '2026-10-01T08:00:00Z' },
      { path: 'src/early.mjs', ...trustedUser, createdAt: '2026-09-30T08:00:00Z' },
      { path: 'src/out.mjs', type: 'User', association: 'NONE', login: 'x', createdAt: '2026-10-01T09:00:00Z' },
    ],
    commits,
    filesSince: { aaa1111: ['src/a.mjs', 'docs/c.md'], bbb2222: [] },
    checks: { ccc3333xx: [{ conclusion: 'success' }, { conclusion: 'failure' }] },
  });
  assert.equal(rec.reviewed, true);
  assert.equal(rec.rounds.length, 2);
  assert.deepEqual([rec.rounds[0].blocking, rec.rounds[0].blocking_touched, rec.rounds[0].non_blocking, rec.rounds[0].non_blocking_touched, rec.rounds[0].nits], [1, 1, 2, 1, 1]);
  assert.equal(rec.rounds[0].commits_after, 2);
  assert.equal(rec.final_status, 'DONE');
  assert.deepEqual([rec.blocking_first, rec.blocking_last], [1, 0]);
  assert.equal(rec.human_threads_after_review, 2);
  assert.equal(rec.human_threads_beyond_review, 1);
  assert.deepEqual(rec.ci_head, { success: 1, failure: 1, other: 0 });
  assert.equal(rec.time_to_merge_h, 12);
});

test('buildRecord: untrusted and bot copies of a report are ignored; no report → reviewed false, unknowns null', () => {
  const body = report('DONE', 'aaa1111');
  const rec = buildRecord({
    pr: { ...prInfo, merged: false, mergedAt: null },
    comments: [
      { id: 1, type: 'User', association: 'NONE', login: 'x', createdAt: '2026-10-01T01:00:00Z', body },
      { id: 2, type: 'Bot', association: 'NONE', login: 'a[bot]', createdAt: '2026-10-01T02:00:00Z', body },
    ],
    commits,
  });
  assert.equal(rec.reviewed, false);
  assert.deepEqual([rec.final_status, rec.human_threads_after_review, rec.ci_head, rec.time_to_merge_h], [null, null, null, null]);
});

test('buildRecord: compare unavailable → touched counts null, not 0', () => {
  const rec = buildRecord({
    pr: prInfo,
    comments: [{ id: 1, ...trustedUser, createdAt: '2026-10-01T01:00:00Z', body: report('NEEDS_REVIEW', 'aaa1111', { blocking: [B1] }) }],
    commits,
    filesSince: { aaa1111: null },
  });
  assert.equal(rec.rounds[0].blocking_touched, null);
  assert.equal(rec.rounds[0].non_blocking_touched, null);
});

test('aggregate: rates over known rounds only; empty base → null', () => {
  const rec = (rounds, final, after, beyond) => ({ reviewed: rounds.length > 0, rounds, final_status: final, human_threads_after_review: after, human_threads_beyond_review: beyond });
  const r1 = rec([{ blocking: 2, blocking_touched: 1, non_blocking: 4, non_blocking_touched: 4 }, { blocking: 0, blocking_touched: 0, non_blocking: 0, non_blocking_touched: 0 }], 'DONE', 3, 1);
  const r2 = rec([{ blocking: 1, blocking_touched: null, non_blocking: 1, non_blocking_touched: null }], 'NEEDS_REVIEW', null, null);
  const a = aggregate([r1, r2, rec([], null, null, null)]);
  assert.equal(a.prs, 3);
  assert.equal(a.reviewed, 2);
  assert.equal(a.reports, 3);
  assert.equal(a.blocking_touched_rate, 0.5);
  assert.equal(a.non_blocking_touched_rate, 1);
  assert.equal(a.converged_rate, 0.5);
  assert.equal(a.mean_rounds, 1.5);
  assert.deepEqual([a.human_threads_after_review, a.human_threads_beyond_review], [3, 1]);
  assert.equal(aggregate([]).converged_rate, null);
});

test('CLI: no argument → usage, exit 1; unknown flag → exit 1; bad ref → exit 1', () => {
  for (const args of [[], ['--nope'], ['not-a-ref']]) {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Usage|Error/);
  }
});

test('asMember: keeps path of a review comment, null for an issue comment', () => {
  const rc = asMember({ id: 1, path: 'src/a.mjs', user: { login: 'dev', type: 'User' }, author_association: 'OWNER', body: 'x', created_at: '2026-10-01T00:00:00Z' });
  assert.equal(rc.path, 'src/a.mjs');
  assert.equal(asMember({ id: 2, body: 'y', created_at: '2026-10-01T00:00:00Z' }).path, null);
});

test('buildRecord: a thread on a file a report cited is not beyond the review', () => {
  const body = report('NEEDS_REVIEW', 'aaa1111', { blocking: [B1] });
  const rec = buildRecord({
    pr: prInfo,
    comments: [{ id: 1, ...trustedUser, createdAt: '2026-10-01T01:00:00Z', body }],
    threads: [asMember({ id: 9, path: 'src/a.mjs', user: { login: 'dev', type: 'User' }, author_association: 'OWNER', body: 'q', created_at: '2026-10-01T02:00:00Z' })],
    commits,
  });
  assert.deepEqual([rec.human_threads_after_review, rec.human_threads_beyond_review], [1, 0]);
});

test('CLI: --recent outside 1..100 or non-numeric → exit 1', () => {
  for (const n of ['0', '101', 'abc']) {
    const r = spawnSync(process.execPath, [SCRIPT, '--repo', 'o/r', '--recent', n], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--recent expects/);
  }
});

test('buildRecord: generated and bot threads on a trusted account are not human feedback', () => {
  const thread = (body, over = {}) => ({ path: 'src/x.mjs', ...trustedUser, createdAt: '2026-10-01T02:00:00Z', body, ...over });
  const rec = buildRecord({
    pr: prInfo,
    comments: [{ id: 1, ...trustedUser, createdAt: '2026-10-01T01:00:00Z', body: report('NEEDS_REVIEW', 'aaa1111', { blocking: [B1] }) }],
    threads: [
      thread('human question'),
      thread('auto finding\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_'),
      thread('<!-- adl-review sha=abc verdict=APPROVE -->'),
      thread('bot', { type: 'Bot', login: 'x[bot]' }),
    ],
    commits,
  });
  assert.deepEqual([rec.human_threads_after_review, rec.human_threads_beyond_review], [1, 1]);
});
