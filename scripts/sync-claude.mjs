#!/usr/bin/env node
// Incremental sync from ai-dev-tools → ~/.claude
// Usage: node scripts/sync-claude.mjs [--src <path>] [--dst <path>]
// Node ≥ 20, no external dependencies

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const SYNC_DIRS = ['commands', 'agents', 'prompts'];

export function sync(srcRoot, dstRoot) {
  mkdirSync(dstRoot, { recursive: true });

  const totals = { new: 0, updated: 0, extra: 0 };

  for (const dirName of SYNC_DIRS) {
    const srcDir = join(srcRoot, dirName);
    const dstDir = join(dstRoot, dirName);

    if (!existsSync(srcDir)) {
      console.log(`[${dirName}] source directory not found — skipping`);
      continue;
    }

    const srcFiles = collectFiles(srcDir);
    const dstFiles = new Set(collectFiles(dstDir));
    const srcSet = new Set(srcFiles);
    const counts = { new: 0, updated: 0, extra: 0 };

    for (const rel of srcFiles) {
      const src = join(srcDir, rel);
      const dst = join(dstDir, rel);

      if (!existsSync(dst)) {
        mkdirSync(dirname(dst), { recursive: true });
        copyFileSync(src, dst);
        console.log(`  [new]     ${dirName}/${rel}`);
        counts.new++;
      } else if (md5(src) !== md5(dst)) {
        copyFileSync(src, dst);
        console.log(`  [updated] ${dirName}/${rel}`);
        counts.updated++;
      }
    }

    for (const rel of dstFiles) {
      if (!srcSet.has(rel)) {
        console.log(`  [extra]   ${dirName}/${rel}`);
        counts.extra++;
      }
    }

    totals.new += counts.new;
    totals.updated += counts.updated;
    totals.extra += counts.extra;

    console.log(`[${dirName}] new: ${counts.new}  updated: ${counts.updated}  extra: ${counts.extra}`);
  }

  console.log('');
  console.log(`sync complete — new: ${totals.new}  updated: ${totals.updated}  extra: ${totals.extra}`);

  return totals;
}

function md5(filePath) {
  return createHash('md5').update(readFileSync(filePath)).digest('hex');
}

function collectFiles(dir) {
  if (!existsSync(dir)) return [];
  const results = [];
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        results.push(relative(dir, full));
      }
    }
  }
  walk(dir);
  return results;
}

// Run as CLI when invoked directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const srcIdx = args.indexOf('--src');
  const dstIdx = args.indexOf('--dst');
  const srcRoot = srcIdx !== -1 ? args[srcIdx + 1] : join(SCRIPTS_DIR, '..');
  const dstRoot = dstIdx !== -1 ? args[dstIdx + 1] : join(homedir(), '.claude');
  sync(srcRoot, dstRoot);
}
