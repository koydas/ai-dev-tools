import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapRestPrActivity, repoFromRemoteUrl, withGraphqlFallback, shouldSkipGraphql, resolveRepo, findUnknownFlag } from '../scripts/gh-transport.mjs';

test('mapRestPrActivity: REST reviews, requested reviewers and issue comments → gh pr view shapes', () => {
  const out = mapRestPrActivity({
    reviews: [{ node_id: 'PRR_1', user: { login: 'alice' }, body: 'lgtm', state: 'APPROVED', submitted_at: 't1', commit_id: 'abc' }],
    requested: { users: [{ login: 'bob' }], teams: [{ name: 'Core', slug: 'core' }] },
    issueComments: [{ node_id: 'IC_1', user: null, body: 'hi', created_at: 't2', html_url: 'u' }],
  });
  assert.deepEqual(out, {
    reviews: [{ id: 'PRR_1', author: { login: 'alice' }, body: 'lgtm', state: 'APPROVED', submittedAt: 't1', commit: { oid: 'abc' } }],
    reviewRequests: [{ __typename: 'User', login: 'bob' }, { __typename: 'Team', name: 'Core', slug: 'core' }],
    prComments: [{ id: 'IC_1', author: { login: null }, body: 'hi', createdAt: 't2', url: 'u' }],
  });
  assert.deepEqual(mapRestPrActivity(), { reviews: [], reviewRequests: [], prComments: [] });
});

test('repoFromRemoteUrl: https and ssh GitHub remotes, null otherwise', () => {
  assert.equal(repoFromRemoteUrl('https://github.com/koydas/ai-dev-tools\n'), 'koydas/ai-dev-tools');
  assert.equal(repoFromRemoteUrl('https://github.com/koydas/ai-dev-tools.git'), 'koydas/ai-dev-tools');
  assert.equal(repoFromRemoteUrl('git@github.com:koydas/my.repo.git'), 'koydas/my.repo');
  assert.equal(repoFromRemoteUrl('https://gitlab.com/o/r.git'), null);
  assert.equal(repoFromRemoteUrl(undefined), null);
});

test('withGraphqlFallback: GraphQL result is returned as is, REST is not called', () => {
  const logs = [];
  assert.equal(withEnv({ CLAUDE_CODE_REMOTE: undefined }, () => withGraphqlFallback(() => 'gql', () => assert.fail('rest called'), (l) => logs.push(l))), 'gql');
  assert.deepEqual(logs, []);
});

test('withGraphqlFallback: on failure, logs the first stderr line (capped) once and returns REST', () => {
  const logs = [];
  const err = Object.assign(new Error('Command failed'), { stderr: `HTTP 403: ${'x'.repeat(200)}\nsecond line` });
  const out = withEnv({ CLAUDE_CODE_REMOTE: undefined }, () => withGraphqlFallback(() => { throw err; }, () => 'rest', (l) => logs.push(l)));
  assert.equal(out, 'rest');
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^GraphQL unavailable \(HTTP 403: x+\) — falling back to REST$/);
  assert.ok(!logs[0].includes('second line'));
  assert.ok(logs[0].length < 200);
});

test('withGraphqlFallback: without stderr the error message is used; a REST failure propagates', () => {
  const logs = [];
  assert.throws(
    () => withEnv({ CLAUDE_CODE_REMOTE: undefined }, () => withGraphqlFallback(() => { throw new Error('boom'); }, () => { throw new Error('rest down'); }, (l) => logs.push(l))),
    /rest down/,
  );
  assert.deepEqual(logs, ['GraphQL unavailable (boom) — falling back to REST']);
});

// The legacy tests above exercise the GraphQL-first path: pin it, whatever the host environment.
const withEnv = (vars, fn) => {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { return fn(); } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
};

test('shouldSkipGraphql: set → skip; absent, empty, 0/false → keep GraphQL; FORCE_GRAPHQL=1 wins', () => {
  assert.equal(shouldSkipGraphql({ CLAUDE_CODE_REMOTE: 'true' }), true);
  assert.equal(shouldSkipGraphql({ CLAUDE_CODE_REMOTE: '1' }), true);
  assert.equal(shouldSkipGraphql({}), false);
  assert.equal(shouldSkipGraphql({ CLAUDE_CODE_REMOTE: '' }), false);
  assert.equal(shouldSkipGraphql({ CLAUDE_CODE_REMOTE: '  ' }), false);
  assert.equal(shouldSkipGraphql({ CLAUDE_CODE_REMOTE: '0' }), false);
  assert.equal(shouldSkipGraphql({ CLAUDE_CODE_REMOTE: 'false' }), false);
  assert.equal(shouldSkipGraphql({ CLAUDE_CODE_REMOTE: 'true', AI_DEV_TOOLS_FORCE_GRAPHQL: '1' }), false);
  assert.equal(shouldSkipGraphql({ CLAUDE_CODE_REMOTE: 'true', AI_DEV_TOOLS_FORCE_GRAPHQL: '0' }), true);
});

test('withGraphqlFallback: cloud session → GraphQL not attempted, no log, REST result; opt-out restores GraphQL', () => {
  const logs = [];
  withEnv({ CLAUDE_CODE_REMOTE: 'true', AI_DEV_TOOLS_FORCE_GRAPHQL: undefined }, () => {
    assert.equal(withGraphqlFallback(() => assert.fail('graphql called'), () => 'rest', (l) => logs.push(l)), 'rest');
    assert.throws(() => withGraphqlFallback(() => assert.fail('graphql called'), () => { throw new Error('rest down'); }), /rest down/);
  });
  assert.deepEqual(logs, []);
  withEnv({ CLAUDE_CODE_REMOTE: 'true', AI_DEV_TOOLS_FORCE_GRAPHQL: '1' }, () => {
    assert.equal(withGraphqlFallback(() => 'gql', () => assert.fail('rest called')), 'gql');
  });
});

test('resolveRepo: an explicit repo is returned without any lookup', () => {
  assert.equal(resolveRepo('o/r'), 'o/r');
});

test('findUnknownFlag: known value/bool options and positionals pass; the first unknown option is returned', () => {
  const spec = { value: ['--repo', '--branch'], bool: ['--json'] };
  assert.equal(findUnknownFlag(['42', '--repo', 'o/r', '--json'], spec), null);
  assert.equal(findUnknownFlag([], spec), null);
  assert.equal(findUnknownFlag(['42', '--bogus'], spec), '--bogus');
  assert.equal(findUnknownFlag(['--repo', 'o/r', '-x', '--other'], spec), '-x');
  assert.equal(findUnknownFlag(['--repo', '--bogus'], spec), null); // consumed as the value of --repo
  assert.equal(findUnknownFlag(['--bogus']), '--bogus');
});
