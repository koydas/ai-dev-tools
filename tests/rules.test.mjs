import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RULES_DIR = join(REPO_ROOT, 'rules');

// Claude Code reads only `paths` from a rule's frontmatter, and loads the rule
// unconditionally when that YAML does not parse (ADR-015). Accept the one shape we write.
function parsePaths(content) {
  if (!content.startsWith('---\n')) return null;
  const end = content.indexOf('\n---\n', 4);
  assert.notEqual(end, -1, 'frontmatter is not closed');
  const lines = content.slice(4, end).split('\n');
  assert.equal(lines[0], 'paths:', 'frontmatter must hold only a `paths:` list');
  const paths = lines.slice(1).map((line) => {
    const m = /^ {2}- "([^"]+)"$/.exec(line);
    assert.ok(m, `not a quoted list item: ${JSON.stringify(line)}`);
    return m[1];
  });
  assert.ok(paths.length > 0, '`paths:` is empty');
  return paths;
}

describe('rules/', () => {
  const files = readdirSync(RULES_DIR).filter((f) => f.endsWith('.md'));

  test('contains rules', () => {
    assert.ok(files.length > 0);
  });

  for (const file of files) {
    test(`${file} has no frontmatter or a valid paths list`, () => {
      const paths = parsePaths(readFileSync(join(RULES_DIR, file), 'utf8'));
      for (const p of paths ?? []) {
        assert.ok(!p.startsWith('/'), `${p}: absolute pattern`);
        assert.ok(!p.includes('['), `${p}: \`[\` starts a bracket expression`);
      }
    });
  }

  test('no flat skills/ directory remains', () => {
    assert.equal(existsSync(join(REPO_ROOT, 'skills')), false);
  });
});

describe('parsePaths', () => {
  test('no frontmatter → unconditional rule', () => {
    assert.equal(parsePaths('# rule\n'), null);
  });

  test('returns the patterns', () => {
    assert.deepEqual(parsePaths('---\npaths:\n  - "**/*.cs"\n  - "**/*.sln"\n---\n\n# r\n'), ['**/*.cs', '**/*.sln']);
  });

  test('rejects an unclosed frontmatter', () => {
    assert.throws(() => parsePaths('---\npaths:\n  - "**/*.cs"\n# r\n'), /not closed/);
  });

  test('rejects another field', () => {
    assert.throws(() => parsePaths('---\nname: x\n---\n'), /only a `paths:` list/);
  });

  test('rejects an unquoted item', () => {
    assert.throws(() => parsePaths('---\npaths:\n  - **/*.cs\n---\n'), /not a quoted list item/);
  });

  test('rejects an empty list', () => {
    assert.throws(() => parsePaths('---\npaths:\n---\n'), /empty/);
  });
});
