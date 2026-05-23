import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadGitConfig } from '../scripts/config.mjs';

function tempFile(content) {
  const dir = mkdtempSync(join(tmpdir(), 'cfg-test-'));
  const file = join(dir, 'git.yaml');
  writeFileSync(file, content);
  return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('config', () => {
  test('returns defaults when file does not exist', () => {
    const cfg = loadGitConfig('/nonexistent/path/git.yaml');
    assert.equal(cfg.default_branch, 'main');
    assert.equal(cfg.remote, 'origin');
  });

  test('reads default_branch and remote from yaml', () => {
    const { file, cleanup } = tempFile('default_branch: develop\nremote: upstream\n');
    try {
      const cfg = loadGitConfig(file);
      assert.equal(cfg.default_branch, 'develop');
      assert.equal(cfg.remote, 'upstream');
    } finally { cleanup(); }
  });

  test('ignores comments and blank lines', () => {
    const { file, cleanup } = tempFile('# comment\n\ndefault_branch: master\n# another\nremote: origin\n');
    try {
      const cfg = loadGitConfig(file);
      assert.equal(cfg.default_branch, 'master');
      assert.equal(cfg.remote, 'origin');
    } finally { cleanup(); }
  });

  test('falls back to defaults for keys absent from the file', () => {
    const { file, cleanup } = tempFile('default_branch: staging\n');
    try {
      const cfg = loadGitConfig(file);
      assert.equal(cfg.default_branch, 'staging');
      assert.equal(cfg.remote, 'origin'); // default
    } finally { cleanup(); }
  });

  test('inline comments are stripped from values', () => {
    const { file, cleanup } = tempFile('default_branch: main # production branch\nremote: origin\n');
    try {
      const cfg = loadGitConfig(file);
      assert.equal(cfg.default_branch, 'main');
    } finally { cleanup(); }
  });
});
