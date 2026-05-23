#!/usr/bin/env node
// Pull latest on all configured repositories
// Usage: node scripts/update-repos.mjs [--config <path>]
// Config file: JSON array of repo paths, or one path per line in a .txt file
// Default config: ~/dev/.repos (one path per line)
// Node ≥ 20, no external dependencies

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_CONFIG = join(homedir(), 'dev', '.repos');

export function updateRepos(repoPaths) {
  const results = [];
  for (const repoPath of repoPaths) {
    const result = updateRepo(repoPath);
    results.push(result);
  }
  return results;
}

function updateRepo(repoPath) {
  if (!existsSync(repoPath)) {
    return { path: repoPath, status: 'missing', message: 'Directory not found' };
  }

  const gitDir = join(repoPath, '.git');
  if (!existsSync(gitDir)) {
    return { path: repoPath, status: 'skipped', message: 'Not a git repository' };
  }

  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath, encoding: 'utf8' }).trim();
    const result = spawnSync('git', ['pull', '--ff-only'], { cwd: repoPath, encoding: 'utf8' });

    if (result.status !== 0) {
      return { path: repoPath, branch, status: 'error', message: result.stderr.trim() };
    }

    const output = result.stdout.trim();
    const status = output.includes('Already up to date') ? 'up-to-date' : 'updated';
    return { path: repoPath, branch, status, message: output.split('\n')[0] };
  } catch (err) {
    return { path: repoPath, status: 'error', message: err.message };
  }
}

function loadConfig(configPath) {
  if (!existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    console.error('Create a file with one repo path per line, or pass --config <path>.');
    process.exit(1);
  }

  const content = readFileSync(configPath, 'utf8').trim();

  if (configPath.endsWith('.json')) {
    return JSON.parse(content);
  }

  return content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
}

function formatResults(results) {
  let updated = 0;
  for (const r of results) {
    const icon = r.status === 'updated' ? '↑' : r.status === 'up-to-date' ? '✓' : '✗';
    const branch = r.branch ? ` (${r.branch})` : '';
    console.log(`  ${icon}  ${r.path}${branch} — ${r.message}`);
    if (r.status === 'updated') updated++;
  }
  console.log(`\n${results.length} repos checked, ${updated} updated`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  const configIdx = args.indexOf('--config');
  const configPath = configIdx !== -1 ? args[configIdx + 1] : DEFAULT_CONFIG;

  const repoPaths = loadConfig(configPath);
  console.log(`Updating ${repoPaths.length} repos...\n`);

  const results = updateRepos(repoPaths);

  if (args.includes('--json')) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    formatResults(results);
  }
}
