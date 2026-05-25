#!/usr/bin/env node
// Full setup: deploy workspace config, create skills junction, sync commands/agents
// Usage: node scripts/onboarding.mjs [--workspace <path>] [--claude-dir <path>] [--dry-run]
// Node ≥ 20, no external dependencies

import { existsSync, mkdirSync, copyFileSync, writeFileSync, symlinkSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, platform } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPTS_DIR, '..');
const DEFAULT_WORKSPACE = join(homedir(), 'dev');
const DEFAULT_CLAUDE_DIR = join(homedir(), '.claude');

async function main() {
  const args = process.argv.slice(2);
  const workspaceIdx = args.indexOf('--workspace');
  const claudeDirIdx = args.indexOf('--claude-dir');
  const dryRun = args.includes('--dry-run');

  const workspaceDir = workspaceIdx !== -1 ? args[workspaceIdx + 1] : DEFAULT_WORKSPACE;
  const claudeDir = claudeDirIdx !== -1 ? args[claudeDirIdx + 1] : DEFAULT_CLAUDE_DIR;

  console.log('ai-dev-tools onboarding\n');
  console.log(`  Repo:      ${REPO_ROOT}`);
  console.log(`  Workspace: ${workspaceDir}`);
  console.log(`  Claude:    ${claudeDir}`);
  console.log(dryRun ? '  Mode:      DRY RUN (no changes)\n' : '');

  // 1. Deploy workspace/CLAUDE.md → <workspace>/CLAUDE.md
  step('1. Deploying workspace CLAUDE.md');
  const srcClaude = join(REPO_ROOT, 'workspace', 'CLAUDE.md');
  const dstClaude = join(workspaceDir, 'CLAUDE.md');
  deployFile(srcClaude, dstClaude, dryRun);

  // 2. Deploy workspace/.claude/CLAUDE.md → ~/.claude/CLAUDE.md
  step('2. Deploying .claude/CLAUDE.md');
  const srcDotClaude = join(REPO_ROOT, 'workspace', '.claude', 'CLAUDE.md');
  const dstDotClaude = join(claudeDir, 'CLAUDE.md');
  deployFile(srcDotClaude, dstDotClaude, dryRun);

  // 3. Create skills junction/symlink: ~/.claude/skills/ → <repo>/skills/
  step('3. Linking skills directory');
  const skillsSrc = join(REPO_ROOT, 'skills');
  const skillsDst = join(claudeDir, 'skills');
  linkSkills(skillsSrc, skillsDst, dryRun);

  // 4. Sync commands and agents
  step('4. Syncing commands and agents');
  if (!dryRun) {
    const syncResult = spawnSync('node', [join(SCRIPTS_DIR, 'sync-claude.mjs'), '--dst', claudeDir], {
      stdio: 'inherit',
      encoding: 'utf8',
    });
    if (syncResult.status !== 0) {
      console.error('  sync failed — onboarding incomplete');
      process.exit(syncResult.status ?? 1);
    }
  } else {
    console.log('  [dry-run] would run sync-claude.mjs');
  }

  // 5. Create .env template if it doesn't exist
  step('5. Creating .env template');
  const envPath = join(REPO_ROOT, '.env');
  if (!existsSync(envPath)) {
    const envTemplate = '# GitHub token — scopes: repo, read:org\ngh_token=\n';
    if (!dryRun) {
      writeFileSync(envPath, envTemplate);
      console.log(`  created: ${envPath}`);
    } else {
      console.log(`  [dry-run] would create: ${envPath}`);
    }
  } else {
    console.log('  already exists, skipping');
  }

  console.log('\nOnboarding complete.');
  console.log(`\nNext: open ${join(REPO_ROOT, '.env')} and set gh_token`);
}

function step(label) {
  console.log(`\n${label}`);
}

function deployFile(src, dst, dryRun) {
  if (!existsSync(src)) {
    console.log(`  skipped: source not found (${src})`);
    return;
  }
  if (dryRun) {
    console.log(`  [dry-run] ${src} → ${dst}`);
    return;
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  console.log(`  copied: ${dst}`);
}

function linkSkills(src, dst, dryRun) {
  if (!existsSync(src)) {
    console.log('  skipped: skills/ directory not found in repo');
    return;
  }

  if (existsSync(dst)) {
    console.log(`  already exists: ${dst}`);
    return;
  }

  if (dryRun) {
    console.log(`  [dry-run] link ${dst} → ${src}`);
    return;
  }

  mkdirSync(dirname(dst), { recursive: true });

  if (platform() === 'win32') {
    // Windows: create a directory junction
    execSync(`mklink /J "${dst}" "${src}"`, { shell: 'cmd.exe' });
    console.log(`  junction created: ${dst} → ${src}`);
  } else {
    symlinkSync(src, dst, 'dir');
    console.log(`  symlink created: ${dst} → ${src}`);
  }
}

main().catch(err => {
  console.error('Onboarding failed:', err.message);
  process.exit(1);
});
