#!/usr/bin/env node
// Resolve where a PR review report lives → absolute path on stdout
// Usage: node scripts/report-path.mjs <pr-number> [<title>]   → <reports_dir>/<pr-number>-<slug>.md
//        node scripts/report-path.mjs --dir                    → <reports_dir>
// reports_dir: AI_DEV_TOOLS_REPORTS_DIR env var, else configs/paths.yaml, else ~/dev/pr-reviews
// Node ≥ 20

import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPathsConfig } from './config.mjs';

const USAGE = 'Usage: node scripts/report-path.mjs (<pr-number> [<title>] | --dir)';
const MAX_SLUG_LENGTH = 50;

// Pure: title → lowercase ASCII kebab-case slug, at most MAX_SLUG_LENGTH chars, never empty.
export function slugify(title) {
  const slug = String(title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    const dir = resolveReportsDir({ env: process.env, config: loadPathsConfig(), home: homedir(), cwd: process.cwd() });
    if (args[0] === '--dir' && args.length === 1) {
      console.log(dir);
    } else if (args.length >= 1 && args.length <= 2 && !args[0].startsWith('--')) {
      console.log(reportPath(args[0], args[1], dir));
    } else {
      throw new Error(USAGE);
    }
  } catch (err) {
    console.error(err.message === USAGE ? USAGE : `${err.message}\n${USAGE}`);
    process.exit(1);
  }
}
