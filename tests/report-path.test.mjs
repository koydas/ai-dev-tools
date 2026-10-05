import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { slugify, resolveReportsDir, reportPath, isInside, assertOutsideWorkingTree, prFromJson } from '../scripts/report-path.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/report-path.mjs', import.meta.url));
import { loadPathsConfig } from '../scripts/config.mjs';

test('slugify: kebab-case, accents stripped, punctuation collapsed', () => {
  assert.equal(slugify('fix(guardrails): docs/ and README.md are protected'), 'fix-guardrails-docs-and-readme-md-are-protected');
  assert.equal(slugify('Révision  —  Été'), 'revision-ete');
});

test('slugify: capped length without a trailing dash, never empty', () => {
  const slug = slugify(`${'a'.repeat(49)} b`);
  assert.equal(slug, 'a'.repeat(49));
  assert.ok(slugify('x'.repeat(200)).length <= 50);
  assert.equal(slugify(''), 'review');
  assert.equal(slugify(undefined), 'review');
  assert.equal(slugify('!!!'), 'review');
});

test('resolveReportsDir: env override wins over config', () => {
  assert.equal(resolveReportsDir({ env: { AI_DEV_TOOLS_REPORTS_DIR: '/work/reviews' }, config: { reports_dir: '~/dev/pr-reviews' }, home: '/h' }), '/work/reviews');
});

test('resolveReportsDir: ~ expands to home, relative resolves from cwd', () => {
  assert.equal(resolveReportsDir({ config: { reports_dir: '~/dev/pr-reviews' }, home: '/h' }), join('/h', 'dev/pr-reviews'));
  assert.equal(resolveReportsDir({ config: { reports_dir: '~' }, home: '/h' }), '/h');
  assert.equal(resolveReportsDir({ config: { reports_dir: 'reviews' }, cwd: '/repo' }), join('/repo', 'reviews'));
  assert.equal(resolveReportsDir({ env: { AI_DEV_TOOLS_REPORTS_DIR: '' }, config: { reports_dir: '/abs' } }), '/abs');
});

test('resolveReportsDir: nothing configured fails', () => {
  assert.throws(() => resolveReportsDir({ config: {} }), /not configured/);
  assert.throws(() => resolveReportsDir(), /not configured/);
});

test('reportPath: <dir>/<number>-<slug>.md, rejects a non-number', () => {
  assert.equal(reportPath(176, 'Guardrails docs', '/r'), join('/r', '176-guardrails-docs.md'));
  assert.equal(reportPath('42', undefined, '/r'), join('/r', '42-review.md'));
  assert.throws(() => reportPath('42a', 't', '/r'), /not a PR number/);
});

test('loadPathsConfig: defaults when missing, file value, empty value falls back', () => {
  assert.equal(loadPathsConfig('/nonexistent/paths.yaml').reports_dir, '~/dev/pr-reviews');
  const dir = mkdtempSync(join(tmpdir(), 'paths-test-'));
  try {
    const file = join(dir, 'paths.yaml');
    writeFileSync(file, 'reports_dir: /tmp/out # comment\n');
    assert.equal(loadPathsConfig(file).reports_dir, '/tmp/out');
    writeFileSync(file, 'reports_dir:\n');
    assert.equal(loadPathsConfig(file).reports_dir, '~/dev/pr-reviews');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the versioned configs/paths.yaml keeps the historical default', () => {
  assert.equal(loadPathsConfig().reports_dir, '~/dev/pr-reviews');
});

test('isInside: same dir and children are inside, siblings and parents are not', () => {
  assert.equal(isInside('/repo', '/repo'), true);
  assert.equal(isInside('/repo/a/b', '/repo'), true);
  assert.equal(isInside('/repo-other', '/repo'), false);
  assert.equal(isInside('/', '/repo'), false);
  assert.equal(isInside('/repo/../x', '/repo'), false);
});

test('assertOutsideWorkingTree: refuses a non-ignored dir inside the tree, accepts the rest', () => {
  assert.throws(() => assertOutsideWorkingTree('/repo/reviews', { toplevel: '/repo' }), /inside the git working tree/);
  assert.throws(() => assertOutsideWorkingTree('/repo', { toplevel: '/repo' }), /inside the git working tree/);
  assert.doesNotThrow(() => assertOutsideWorkingTree('/repo/reviews', { toplevel: '/repo', ignored: true }));
  assert.doesNotThrow(() => assertOutsideWorkingTree('/tmp/reviews', { toplevel: '/repo' }));
  assert.doesNotThrow(() => assertOutsideWorkingTree('/repo/reviews', { toplevel: null }));
  assert.doesNotThrow(() => assertOutsideWorkingTree('/repo/reviews'));
});

test('prFromJson: number and title from gh-get-pr.mjs output, fails on anything else', () => {
  assert.deepEqual(prFromJson('{"number":176,"title":"t"}'), { number: 176, title: 't' });
  assert.deepEqual(prFromJson('{"number":1}'), { number: 1, title: undefined });
  assert.throws(() => prFromJson('not json'), /expects PR JSON/);
  assert.throws(() => prFromJson('{"number":"1"}'), /integer "number"/);
  assert.throws(() => prFromJson('null'), /integer "number"/);
});

test('CLI: --from-pr reads the title from stdin JSON; a shell payload in the title is only slugged', () => {
  const out = mkdtempSync(join(tmpdir(), 'reports-out-'));
  try {
    const r = spawnSync(process.execPath, [SCRIPT, '--from-pr'], {
      input: JSON.stringify({ number: 7, title: 'x $(touch pwned) `id`' }),
      env: { ...process.env, AI_DEV_TOOLS_REPORTS_DIR: out }, cwd: out, encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), join(out, '7-x-touch-pwned-id.md'));
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('CLI: rejects positional arguments and a reports dir inside the working tree unless git-ignored', () => {
  const repo = mkdtempSync(join(tmpdir(), 'reports-repo-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: repo });
    const run = (args, dir) => spawnSync(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, AI_DEV_TOOLS_REPORTS_DIR: dir }, cwd: repo, encoding: 'utf8',
    });
    assert.equal(run(['42', 'title'], tmpdir()).status, 1);
    const inside = run(['--dir'], '.');
    assert.equal(inside.status, 1);
    assert.match(inside.stderr, /inside the git working tree/);
    writeFileSync(join(repo, '.gitignore'), 'reviews/\n');
    const ignored = run(['--dir'], 'reviews');
    assert.equal(ignored.status, 0, ignored.stderr);
    assert.equal(ignored.stdout.trim(), join(repo, 'reviews'));
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
