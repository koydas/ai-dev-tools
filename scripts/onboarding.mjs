#!/usr/bin/env node
// Full setup: deploy workspace config, link rules directory, sync commands/agents
// Usage: node scripts/onboarding.mjs [--workspace <path>] [--claude-dir <path>] [--dry-run]
// Node ≥ 20, no external dependencies

import { existsSync, mkdirSync, copyFileSync, writeFileSync, symlinkSync, readdirSync, lstatSync, readlinkSync, unlinkSync, rmdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir, platform } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

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

  // 3. Link rules: ~/.claude/rules/ai-dev-tools/ → <repo>/rules/ (ADR-015)
  step('3. Linking rules directory');
  removeLegacySkillsLink(join(claudeDir, 'skills'), dryRun);
  const rulesSrc = join(REPO_ROOT, 'rules');
  const rulesDst = join(claudeDir, 'rules', 'ai-dev-tools');
  linkRules(rulesSrc, rulesDst, dryRun);

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

// Resolved target of the link at `path`; null when `path` is something else, undefined when absent.
// A dangling link is still a link: existsSync() would report it absent and symlinkSync() then fail.
function linkTarget(path) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return undefined;
  }
  if (!stat.isSymbolicLink()) return null;
  const target = readlinkSync(path).replace(/^\\\\\?\\/, ''); // junctions read back as \\?\C:\...
  return resolve(dirname(path), target);
}

function removeLink(path) {
  try {
    unlinkSync(path);
  } catch (err) {
    if (err.code !== 'EPERM' && err.code !== 'EISDIR') throw err;
    rmdirSync(path); // Windows directory junction
  }
}

// Before ADR-015, ~/.claude/skills/ was a link to <clone>/skills/ — possibly another clone, now
// moved or deleted. Remove a link to this clone's skills/ or to a pre-ADR-015 skills/ (it holds
// scope-guard.md); report any other dangling link. A real directory holds the user's own skills.
function removeLegacySkillsLink(dst, dryRun) {
  const target = linkTarget(dst);
  if (!target) return;
  const legacy = target === resolve(REPO_ROOT, 'skills') || existsSync(join(target, 'scope-guard.md'));
  if (!legacy) {
    if (!existsSync(target)) {
      console.log(`  warning: ${dst} is a dangling link (→ ${target}) — remove it to install Agent Skills there`);
    }
    return;
  }
  if (dryRun) {
    console.log(`  [dry-run] would remove legacy link: ${dst}`);
    return;
  }
  removeLink(dst);
  console.log(`  removed legacy link: ${dst}`);
}

function linkRules(src, dst, dryRun) {
  if (!existsSync(src)) {
    console.log('  skipped: rules/ directory not found in repo');
    return;
  }

  const current = linkTarget(dst);
  if (current === resolve(src)) {
    console.log(`  already linked: ${dst} → ${src}`);
    return;
  }
  if (current === null) {
    // Not a link: user content we must not overwrite.
    throw new Error(`${dst} exists and is not a link — move it away, then re-run onboarding`);
  }

  if (dryRun) {
    if (current) console.log(`  [dry-run] would replace stale link: ${dst} → ${current}`);
    console.log(`  [dry-run] link ${dst} → ${src}`);
    return;
  }

  mkdirSync(dirname(dst), { recursive: true });

  // A link to another clone (relocated, or an old checkout) — possibly dangling.
  if (current) {
    removeLink(dst);
    console.log(`  replaced stale link: ${dst} → ${current}`);
  }

  if (platform() === 'win32') {
    // Windows: create a directory junction
    execFileSync('cmd.exe', ['/c', 'mklink', '/J', dst, src]);
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
