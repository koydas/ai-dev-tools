import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/checkpoint.mjs', import.meta.url));
const USAGE = /Usage: node scripts\/checkpoint\.mjs write\|read\|list/;

// Runs the CLI with a scratch HOME so nothing touches the real ~/dev/checkpoints.
function run(args, input = '') {
  const home = mkdtempSync(join(tmpdir(), 'ckpt-'));
  try {
    return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', input, env: { ...process.env, HOME: home, USERPROFILE: home }, timeout: 10_000 });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function assertCleanError(r, message) {
  assert.equal(r.status, 1);
  assert.match(r.stderr, message);
  assert.match(r.stderr, USAGE);
  assert.doesNotMatch(r.stderr, /\n\s+at /); // no stack trace
  assert.doesNotMatch(r.stderr, /node:internal|file:\/\//);
}

test('checkpoint CLI: invalid step → Error + Usage, no stack trace', () => {
  for (const cmd of ['write', 'read']) {
    assertCleanError(run([cmd, '--repo', 'o/r', '1', 'step'], 'x'), /^Error: Invalid step "step"/);
  }
});

test('checkpoint CLI: invalid issueId → Error + Usage, no stack trace', () => {
  assertCleanError(run(['write', '--repo', 'o/r', '0', '01-a'], 'x'), /^Error: Invalid issueId "0"/);
  assertCleanError(run(['list', '--repo', 'o/r', 'abc']), /^Error: Invalid issueId "abc"/);
});

test('checkpoint CLI: traversal in issueId or repo → Error + Usage, no stack trace', () => {
  assertCleanError(run(['write', '--repo', 'o/r', '../x', '01-a'], 'x'), /^Error: Invalid issueId "\.\.\/x"/);
  assertCleanError(run(['list', '--repo', '../r', '1']), /^Error: Invalid repo "\.\.\/r"/);
});

test('checkpoint CLI: valid round-trip still works; unknown command prints Usage', () => {
  assert.equal(run(['list', '--repo', 'o/r', '1']).stdout, '(none)\n');
  const r = run(['bogus']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, USAGE);
});
