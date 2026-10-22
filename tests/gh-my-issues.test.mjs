import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Unknown option → `Error …` + Usage on stderr, exit 1, before any network call.
function unknownFlagCli(script, args) {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL(`../scripts/${script}.mjs`, import.meta.url)), ...args], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^Error: unknown option --bogus\nUsage: node scripts\/gh-my-issues\.mjs/);
}

test('gh-my-issues CLI: unknown option is rejected before any network call', () => {
  unknownFlagCli('gh-my-issues', ['--bogus']);
  unknownFlagCli('gh-my-issues', ['--limit', '3', '--bogus']);
});
