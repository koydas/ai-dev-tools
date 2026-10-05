import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { slugify, resolveReportsDir, reportPath } from '../scripts/report-path.mjs';
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
