import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { sync, resolvePluginRoot } from '../scripts/sync-claude.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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
    // no commands/ or agents/ in src

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

  test('syncs agents and commands directories', () => {
    const src = makeTempDir();
    const dst = makeTempDir();
    mkdirSync(join(src, 'agents'));
    mkdirSync(join(src, 'commands'));
    writeFileSync(join(src, 'agents', 'my-agent.md'), '# agent');
    writeFileSync(join(src, 'commands', 'my-command.md'), '# command');

    const totals = sync(src, dst);

    assert.equal(totals.new, 2);
    assert.ok(existsSync(join(dst, 'agents', 'my-agent.md')));
    assert.ok(existsSync(join(dst, 'commands', 'my-command.md')));
    cleanup(src, dst);
  });

  test('replaces ${CLAUDE_PLUGIN_ROOT} with the absolute source root in .md files', () => {
    const src = makeTempDir();
    const dst = makeTempDir();
    mkdirSync(join(src, 'commands'));
    writeFileSync(join(src, 'commands', 'cmd.md'), 'run `node "${CLAUDE_PLUGIN_ROOT}/scripts/a.mjs"` then `${CLAUDE_PLUGIN_ROOT}/scripts/b.mjs`');

    sync(src, dst);

    const out = readFileSync(join(dst, 'commands', 'cmd.md'), 'utf8');
    const root = resolve(src).replaceAll('\\', '/');
    assert.equal(out, `run \`node "${root}/scripts/a.mjs"\` then \`${root}/scripts/b.mjs\``);
    cleanup(src, dst);
  });

  test('a second sync of substituted content reports nothing updated', () => {
    const src = makeTempDir();
    const dst = makeTempDir();
    mkdirSync(join(src, 'agents'));
    writeFileSync(join(src, 'agents', 'a.md'), 'see ${CLAUDE_PLUGIN_ROOT}/scripts/x.mjs');

    sync(src, dst);
    const totals = sync(src, dst);

    assert.equal(totals.new, 0);
    assert.equal(totals.updated, 0);
    cleanup(src, dst);
  });

  test('leaves non-Markdown files byte-identical', () => {
    const src = makeTempDir();
    const dst = makeTempDir();
    mkdirSync(join(src, 'agents'));
    writeFileSync(join(src, 'agents', 'raw.txt'), '${CLAUDE_PLUGIN_ROOT}');

    sync(src, dst);

    assert.equal(readFileSync(join(dst, 'agents', 'raw.txt'), 'utf8'), '${CLAUDE_PLUGIN_ROOT}');
    cleanup(src, dst);
  });
});

describe('resolvePluginRoot', () => {
  test('uses forward slashes for a Windows-style root', () => {
    const out = resolvePluginRoot('${CLAUDE_PLUGIN_ROOT}/scripts/a.mjs', 'C:\\dev\\ai-dev-tools');
    assert.ok(!out.includes('\\'), out);
    assert.ok(out.endsWith('/scripts/a.mjs'), out);
  });

  test('returns content without the token unchanged', () => {
    assert.equal(resolvePluginRoot('node other.mjs', '/x'), 'node other.mjs');
  });
});

describe('command and agent script references (ADR-013)', () => {
  for (const dir of ['commands', 'agents']) {
    test(`${dir}/ never runs a script through a working-directory-relative path`, () => {
      for (const name of readdirSync(join(REPO_ROOT, dir)).filter((f) => f.endsWith('.md'))) {
        const text = readFileSync(join(REPO_ROOT, dir, name), 'utf8');
        assert.doesNotMatch(text, /node \.?\/?scripts\//, `${dir}/${name}: use node "\${CLAUDE_PLUGIN_ROOT}/scripts/…"`);
        assert.doesNotMatch(text, /["']\.\/scripts\//, `${dir}/${name}: use "\${CLAUDE_PLUGIN_ROOT}/scripts/…"`);
      }
    });
  }
});
