#!/usr/bin/env node
// Resolve where a PR review report lives → absolute path on stdout
// Usage: node scripts/gh-get-pr.mjs <n> | node scripts/report-path.mjs --from-pr   → <reports_dir>/<n>-<slug>.md
//        node scripts/report-path.mjs --from-pr <pr.json>                          (same, from a file)
//        node scripts/report-path.mjs --dir                                        → <reports_dir>
// The title comes from the PR JSON, never from the command line: it is author-controlled text
// and must not go through a shell.
// reports_dir: AI_DEV_TOOLS_REPORTS_DIR env var, else configs/paths.yaml, else ~/dev/pr-reviews.
// It must not be an untracked location inside the current git working tree: a report there makes
// the tree dirty, and pr-analyst then reports every check NOT_RUN on the next review.
// Node ≥ 20

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPathsConfig } from './config.mjs';

const USAGE = 'Usage: node scripts/report-path.mjs (--from-pr [<pr.json>] | --dir)';
const MAX_SLUG_LENGTH = 50;

// Pure: title → lowercase ASCII kebab-case slug, at most MAX_SLUG_LENGTH chars, never empty.
export function slugify(title) {
  const slug = String(title ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
  return slug || 'review';
}

// Pure: env override, then config value; `~` expands to home; relative paths resolve from cwd.
export function resolveReportsDir({ env = {}, config = {}, home = '', cwd = '' } = {}) {
  const raw = env.AI_DEV_TOOLS_REPORTS_DIR || config.reports_dir;
  if (!raw) throw new Error('reports_dir is not configured');
  const expanded = raw === '~' ? home : raw.startsWith('~/') ? join(home, raw.slice(2)) : raw;
  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}

export function reportPath(prNumber, title, dir) {
  if (!/^\d+$/.test(String(prNumber))) throw new Error(`not a PR number: ${prNumber}`);
  return join(dir, `${prNumber}-${slugify(title)}.md`);
}

// Pure: true when `dir` is `root` or below it.
export function isInside(dir, root) {
  const rel = relative(root, dir);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

// Pure: throws when dir is inside the git working tree `toplevel` and not git-ignored.
export function assertOutsideWorkingTree(dir, { toplevel, ignored = false } = {}) {
  if (toplevel && isInside(dir, toplevel) && !ignored) {
    throw new Error(`reports_dir ${dir} is inside the git working tree ${toplevel} and not git-ignored; `
      + 'a report there makes the tree dirty for the next review. Use a directory outside the clone.');
  }
}

// Pure: PR JSON (gh-get-pr.mjs output) → { number, title }.
export function prFromJson(text) {
  let pr;
  try { pr = JSON.parse(text); } catch { throw new Error('--from-pr expects PR JSON (gh-get-pr.mjs output)'); }
  if (!Number.isInteger(pr?.number)) throw new Error('PR JSON has no integer "number"');
  return { number: pr.number, title: pr.title };
}

function gitWorkingTree(dir) {
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  let toplevel;
  try { toplevel = git(['rev-parse', '--show-toplevel']).trim(); } catch { return { toplevel: null }; }
  let ignored = false;
  // Probe a file below dir: a `dir/` pattern does not match dir itself when it does not exist yet.
  try { git(['check-ignore', '-q', '--no-index', join(dir, 'report.md')]); ignored = true; } catch { /* exit 1: not ignored */ }
  return { toplevel, ignored };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    const dir = resolveReportsDir({ env: process.env, config: loadPathsConfig(), home: homedir(), cwd: process.cwd() });
    assertOutsideWorkingTree(dir, gitWorkingTree(dir));
    if (args[0] === '--dir' && args.length === 1) {
      console.log(dir);
    } else if (args[0] === '--from-pr' && args.length <= 2) {
      const { number, title } = prFromJson(readFileSync(args[1] ?? 0, 'utf8'));
      console.log(reportPath(number, title, dir));
    } else {
      throw new Error(USAGE);
    }
  } catch (err) {
    console.error(err.message === USAGE ? USAGE : `${err.message}\n${USAGE}`);
    process.exit(1);
  }
}
