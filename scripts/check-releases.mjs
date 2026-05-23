#!/usr/bin/env node
// Check which configured repos have unreleased commits on main
// Usage: node scripts/check-releases.mjs [--config <path>]
// Node ≥ 20, no external dependencies

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_CONFIG = join(homedir(), 'dev', '.repos');

export function checkReleases(repoPaths) {
  return repoPaths.map(checkRepo);
}

function checkRepo(repoPath) {
  if (!existsSync(join(repoPath, '.git'))) {
    return { path: repoPath, status: 'skipped', message: 'Not a git repository' };
  }

  try {
    // Get latest semver tag
    const tagsRaw = execSync('git tag --sort=-version:refname', { cwd: repoPath, encoding: 'utf8' }).trim();
    const tags = tagsRaw.split('\n').filter(t => /^v?\d+\.\d+\.\d+/.test(t));

    if (tags.length === 0) {
      return { path: repoPath, status: 'no-tags', message: 'No release tags found' };
    }

    const latestTag = tags[0];

    // Count commits on main since the latest tag
    const aheadRaw = execSync(
      `git rev-list --count ${latestTag}..HEAD`,
      { cwd: repoPath, encoding: 'utf8' }
    ).trim();
    const ahead = parseInt(aheadRaw, 10);

    if (ahead === 0) {
      return { path: repoPath, latestTag, status: 'up-to-date', ahead: 0 };
    }

    // Get first commit message since tag
    const firstCommit = execSync(
      `git log --oneline ${latestTag}..HEAD | tail -1`,
      { cwd: repoPath, encoding: 'utf8' }
    ).trim();

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

function formatResults(results) {
  const unreleased = results.filter(r => r.status === 'unreleased');
  const upToDate = results.filter(r => r.status === 'up-to-date');
  const other = results.filter(r => !['unreleased', 'up-to-date'].includes(r.status));

  if (unreleased.length > 0) {
    console.log('Unreleased changes:\n');
    for (const r of unreleased) {
      const name = r.path.split('/').pop();
      console.log(`  ${name.padEnd(20)} ${r.latestTag} → main (+${r.ahead} commits)  ${r.firstCommit ?? ''}`);
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

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  const configIdx = args.indexOf('--config');
  const configPath = configIdx !== -1 ? args[configIdx + 1] : DEFAULT_CONFIG;

  const repoPaths = loadConfig(configPath);
  const results = checkReleases(repoPaths);

  if (args.includes('--json')) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    formatResults(results);
  }
}
