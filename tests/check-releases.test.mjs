import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { checkReleases } from '../scripts/check-releases.mjs';

const GIT_CONFIG = { default_branch: 'main', remote: 'origin' };

// Minimal git identity so commits work in CI without global config
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@test.invalid',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@test.invalid',
};

function git(cwd, ...args) {
  execSync(`git ${args.join(' ')}`, { cwd, env: GIT_ENV, stdio: 'pipe' });
}

function makeRepos() {
  // Bare repo acts as the remote (no network needed)
  const remote = mkdtempSync(join(tmpdir(), 'cr-remote-'));
  execSync('git init --bare', { cwd: remote, stdio: 'pipe' });
  execSync('git symbolic-ref HEAD refs/heads/main', { cwd: remote, stdio: 'pipe' });

  const work = mkdtempSync(join(tmpdir(), 'cr-work-'));
  git(work, 'init');
  git(work, 'symbolic-ref HEAD refs/heads/main');
  git(work, 'config commit.gpgsign false');
  git(work, `remote add origin ${remote}`);

  return {
    remote,
    work,
    cleanup: () => {
      rmSync(remote, { recursive: true, force: true });
      rmSync(work, { recursive: true, force: true });
    },
  };
}

describe('check-releases', () => {
  test('reports skipped for non-git directories', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cr-nogit-'));
    try {
      const [r] = checkReleases([dir], GIT_CONFIG);
      assert.equal(r.status, 'skipped');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reports no-tags when repo has no semver tags', () => {
    const { work, cleanup } = makeRepos();
    try {
      git(work, 'commit --allow-empty -m "initial"');
      git(work, 'push origin main');

      const [r] = checkReleases([work], GIT_CONFIG);
      assert.equal(r.status, 'no-tags');
    } finally { cleanup(); }
  });

  test('reports up-to-date when main has no commits after the latest tag', () => {
    const { work, cleanup } = makeRepos();
    try {
      git(work, 'commit --allow-empty -m "initial"');
      git(work, 'tag v1.0.0');
      git(work, 'push origin main');
      git(work, 'push origin --tags');

      const [r] = checkReleases([work], GIT_CONFIG);
      assert.equal(r.status, 'up-to-date');
      assert.equal(r.latestTag, 'v1.0.0');
      assert.equal(r.ahead, 0);
    } finally { cleanup(); }
  });

  test('reports unreleased commits on main', () => {
    const { work, cleanup } = makeRepos();
    try {
      git(work, 'commit --allow-empty -m "initial"');
      git(work, 'tag v1.0.0');
      git(work, 'commit --allow-empty -m "feat: add feature"');
      git(work, 'commit --allow-empty -m "fix: patch something"');
      git(work, 'push origin main');
      git(work, 'push origin --tags');

      const [r] = checkReleases([work], GIT_CONFIG);
      assert.equal(r.status, 'unreleased');
      assert.equal(r.latestTag, 'v1.0.0');
      assert.equal(r.ahead, 2);
      // firstCommit is the oldest unreleased commit (--reverse -n 1), not the newest
      assert.ok(r.firstCommit.includes('feat: add feature'), `expected oldest commit, got: ${r.firstCommit}`);
    } finally { cleanup(); }
  });

  test('ignores tags on other branches when selecting the baseline tag', () => {
    const { work, cleanup } = makeRepos();
    try {
      git(work, 'commit --allow-empty -m "initial"');
      git(work, 'tag v1.0.0');
      git(work, 'commit --allow-empty -m "feat: on main"');
      git(work, 'push origin main');
      git(work, 'push origin --tags');

      // Create a newer tag on a separate branch (e.g. a next/maintenance branch)
      git(work, 'checkout -b next');
      git(work, 'commit --allow-empty -m "feat: next-only commit"');
      git(work, 'tag v2.0.0-next');
      git(work, 'push origin next');
      git(work, 'push origin --tags');
      git(work, 'checkout main');

      // Baseline must be v1.0.0 (reachable from main), not v2.0.0-next (only on next)
      const [r] = checkReleases([work], GIT_CONFIG);
      assert.equal(r.latestTag, 'v1.0.0', `wrong baseline tag: ${r.latestTag}`);
      assert.equal(r.status, 'unreleased');
      assert.equal(r.ahead, 1);
    } finally { cleanup(); }
  });

  test('compares against remote main, not local HEAD', () => {
    const { work, cleanup } = makeRepos();
    try {
      git(work, 'commit --allow-empty -m "initial"');
      git(work, 'tag v1.0.0');
      git(work, 'commit --allow-empty -m "feat: on main"');
      git(work, 'push origin main');
      git(work, 'push origin --tags');

      // Move to a feature branch and add a commit — HEAD is now NOT on main
      git(work, 'checkout -b feature/test');
      git(work, 'commit --allow-empty -m "feat: feature branch commit"');

      // Must still report the one unreleased commit on main, not two
      const [r] = checkReleases([work], GIT_CONFIG);
      assert.equal(r.status, 'unreleased');
      assert.equal(r.ahead, 1);
      assert.ok(r.firstCommit.includes('feat: on main'), `expected main commit, got: ${r.firstCommit}`);
    } finally { cleanup(); }
  });
});
