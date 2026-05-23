import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { sync } from '../scripts/sync-claude.mjs';

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'sync-test-'));
}

function cleanup(...dirs) {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}

describe('sync-claude', () => {
  test('copies new files to target', () => {
    const src = makeTempDir();
    const dst = makeTempDir();
    mkdirSync(join(src, 'commands'));
    writeFileSync(join(src, 'commands', 'test.md'), '# test');

    const totals = sync(src, dst);

    assert.equal(totals.new, 1);
    assert.equal(totals.updated, 0);
    assert.equal(totals.extra, 0);
    assert.equal(readFileSync(join(dst, 'commands', 'test.md'), 'utf8'), '# test');
    cleanup(src, dst);
  });

  test('skips identical files', () => {
    const src = makeTempDir();
    const dst = makeTempDir();
    mkdirSync(join(src, 'commands'));
    mkdirSync(join(dst, 'commands'));
    writeFileSync(join(src, 'commands', 'test.md'), '# same');
    writeFileSync(join(dst, 'commands', 'test.md'), '# same');

    const totals = sync(src, dst);

    assert.equal(totals.new, 0);
    assert.equal(totals.updated, 0);
    cleanup(src, dst);
  });

  test('updates changed files', () => {
    const src = makeTempDir();
    const dst = makeTempDir();
    mkdirSync(join(src, 'commands'));
    mkdirSync(join(dst, 'commands'));
    writeFileSync(join(src, 'commands', 'test.md'), '# new content');
    writeFileSync(join(dst, 'commands', 'test.md'), '# old content');

    const totals = sync(src, dst);

    assert.equal(totals.updated, 1);
    assert.equal(readFileSync(join(dst, 'commands', 'test.md'), 'utf8'), '# new content');
    cleanup(src, dst);
  });

  test('reports extra files without deleting them', () => {
    const src = makeTempDir();
    const dst = makeTempDir();
    mkdirSync(join(src, 'commands'));
    mkdirSync(join(dst, 'commands'));
    writeFileSync(join(dst, 'commands', 'local-only.md'), '# local');

    const totals = sync(src, dst);

    assert.equal(totals.extra, 1);
    assert.ok(existsSync(join(dst, 'commands', 'local-only.md')), 'extra file must not be deleted');
    cleanup(src, dst);
  });

  test('skips missing source directories silently', () => {
    const src = makeTempDir();
    const dst = makeTempDir();
    // no commands/, agents/, or prompts/ in src

    const totals = sync(src, dst);

    assert.equal(totals.new, 0);
    assert.equal(totals.updated, 0);
    assert.equal(totals.extra, 0);
    cleanup(src, dst);
  });

  test('creates target directory when it does not exist', () => {
    const src = makeTempDir();
    const dst = join(makeTempDir(), 'nonexistent');
    mkdirSync(join(src, 'agents'));
    writeFileSync(join(src, 'agents', 'test-agent.md'), '# agent');

    assert.ok(!existsSync(dst), 'target should not exist before sync');
    sync(src, dst);
    assert.ok(existsSync(dst), 'target should be created by sync');
    assert.ok(existsSync(join(dst, 'agents', 'test-agent.md')));
    cleanup(src, dirname(dst));
  });

  test('syncs agents and prompts directories', () => {
    const src = makeTempDir();
    const dst = makeTempDir();
    mkdirSync(join(src, 'agents'));
    mkdirSync(join(src, 'prompts'));
    writeFileSync(join(src, 'agents', 'my-agent.md'), '# agent');
    writeFileSync(join(src, 'prompts', 'my-prompt.md'), '# prompt');

    const totals = sync(src, dst);

    assert.equal(totals.new, 2);
    assert.ok(existsSync(join(dst, 'agents', 'my-agent.md')));
    assert.ok(existsSync(join(dst, 'prompts', 'my-prompt.md')));
    cleanup(src, dst);
  });
});
