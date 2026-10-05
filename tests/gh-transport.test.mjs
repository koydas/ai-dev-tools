import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapRestPrActivity, repoFromRemoteUrl, withGraphqlFallback } from '../scripts/gh-transport.mjs';

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
  assert.equal(withGraphqlFallback(() => 'gql', () => assert.fail('rest called'), (l) => logs.push(l)), 'gql');
  assert.deepEqual(logs, []);
});

test('withGraphqlFallback: on failure, logs the first stderr line (capped) once and returns REST', () => {
  const logs = [];
  const err = Object.assign(new Error('Command failed'), { stderr: `HTTP 403: ${'x'.repeat(200)}\nsecond line` });
  const out = withGraphqlFallback(() => { throw err; }, () => 'rest', (l) => logs.push(l));
  assert.equal(out, 'rest');
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^GraphQL unavailable \(HTTP 403: x+\) — falling back to REST$/);
  assert.ok(!logs[0].includes('second line'));
  assert.ok(logs[0].length < 200);
});

test('withGraphqlFallback: without stderr the error message is used; a REST failure propagates', () => {
  const logs = [];
  assert.throws(
    () => withGraphqlFallback(() => { throw new Error('boom'); }, () => { throw new Error('rest down'); }, (l) => logs.push(l)),
    /rest down/,
  );
  assert.deepEqual(logs, ['GraphQL unavailable (boom) — falling back to REST']);
});
