#!/usr/bin/env node
// Check which configured repos have unreleased commits on the default branch
// Usage: node scripts/check-releases.mjs [--config <path>]
// Node ≥ 20, no external dependencies

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadGitConfig } from './config.mjs';

const DEFAULT_CONFIG = join(homedir(), 'dev', '.repos');

export function checkReleases(repoPaths, gitConfig) {
  const cfg = gitConfig ?? loadGitConfig();
  return repoPaths.map(p => checkRepo(p, cfg));
}

function checkRepo(repoPath, { default_branch: branch, remote }) {
  if (!existsSync(join(repoPath, '.git'))) {
    return { path: repoPath, status: 'skipped', message: 'Not a git repository' };
  }

  try {
    // Fetch to ensure the remote ref is current before comparing
    try {
      execFileSync('git', ['fetch', remote, branch, '--quiet'], { cwd: repoPath });
    } catch {
      // Non-fatal: proceed with whatever is cached locally
    }

    const remoteBranch = `${remote}/${branch}`;

    // Get the latest semver tag reachable from the remote branch only.
    // --merged restricts to tags that are ancestors of remoteBranch, so tags
    // on other branches (next, maintenance) are excluded from the baseline.
    const tagsRaw = execFileSync(
      'git', ['tag', '--sort=-version:refname', '--merged', remoteBranch],
      { cwd: repoPath, encoding: 'utf8' }
    ).trim();
    const tags = tagsRaw.split('\n').filter(t => /^v?\d+\.\d+\.\d+/.test(t));

    if (tags.length === 0) {
      return { path: repoPath, status: 'no-tags', message: 'No release tags found' };
    }

    const latestTag = tags[0];

    // Count commits on the default branch since the latest tag.
    // latestTag comes from git output and could contain shell metacharacters —
    // passing it via execFileSync arg array avoids any shell interpretation.
    const aheadRaw = execFileSync(
      'git', ['rev-list', '--count', `${latestTag}..${remoteBranch}`],
      { cwd: repoPath, encoding: 'utf8' }
    ).trim();
    const ahead = parseInt(aheadRaw, 10);

    if (ahead === 0) {
      return { path: repoPath, latestTag, status: 'up-to-date', ahead: 0 };
    }

    // Get oldest unreleased commit (first commit after the tag).
    // --reverse alone, then take the first line in JS — combining with -n 1 would
    // apply the limit before reversing and would return the newest commit instead.
    const logOutput = execFileSync(
      'git', ['log', '--oneline', '--reverse', `${latestTag}..${remoteBranch}`],
      { cwd: repoPath, encoding: 'utf8' }
    ).trim();
    const firstCommit = logOutput.split('\n')[0] ?? '';

    return { path: repoPath, latestTag, status: 'unreleased', ahead, firstCommit };
  } catch (err) {
    return { path: repoPath, status: 'error', message: err.message };
  }
}

function loadConfig(configPath) {
  if (!existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    process.exit(1);
  }
  const content = readFileSync(configPath, 'utf8').trim();
  if (configPath.endsWith('.json')) return JSON.parse(content);
  return content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
}

function formatResults(results, branch = 'main') {
  const unreleased = results.filter(r => r.status === 'unreleased');
  const upToDate = results.filter(r => r.status === 'up-to-date');
  const other = results.filter(r => !['unreleased', 'up-to-date'].includes(r.status));

  if (unreleased.length > 0) {
    console.log('Unreleased changes:\n');
    for (const r of unreleased) {
      const name = r.path.split('/').pop();
      console.log(`  ${name.padEnd(20)} ${r.latestTag} → ${branch} (+${r.ahead} commits)  ${r.firstCommit ?? ''}`);
    }
  }

  if (upToDate.length > 0) {
    console.log('\nUp to date:\n');
    for (const r of upToDate) {
      const name = r.path.split('/').pop();
      console.log(`  ${name.padEnd(20)} ${r.latestTag}  ✓`);
    }
  }

  if (other.length > 0) {
    console.log('\nSkipped / errors:\n');
    for (const r of other) {
      const name = r.path.split('/').pop();
      console.log(`  ${name.padEnd(20)} ${r.status} — ${r.message ?? ''}`);
    }
  }

  console.log(`\n${results.length} repos checked, ${unreleased.length} with unreleased changes`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const configIdx = args.indexOf('--config');
  const configPath = configIdx !== -1 ? args[configIdx + 1] : DEFAULT_CONFIG;

  const repoPaths = loadConfig(configPath);
  const cfg = loadGitConfig();
  const results = checkReleases(repoPaths, cfg);

  if (args.includes('--json')) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    formatResults(results, cfg.default_branch);
  }
}
