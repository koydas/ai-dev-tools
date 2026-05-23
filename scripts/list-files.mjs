#!/usr/bin/env node
// Recursive numbered file listing
// Usage: node scripts/list-files.mjs [<path>] [--ignore <pattern>] [--depth <n>]
// Node ≥ 20, no external dependencies

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DEFAULT_IGNORE = ['.git', 'node_modules', '.DS_Store', 'dist', 'build', '__pycache__', '.next', '.nuxt'];

export function listFiles(rootPath, { ignore = DEFAULT_IGNORE, maxDepth = Infinity } = {}) {
  const files = [];
  const ignoreSet = new Set(ignore);

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (ignoreSet.has(entry.name)) continue;
      const full = join(dir, entry.name);
      const rel = relative(rootPath, full);
      files.push({ path: full, rel, name: entry.name, isDir: entry.isDirectory(), depth });
      if (entry.isDirectory()) walk(full, depth + 1);
    }
  }

  walk(rootPath, 0);
  return files;
}

function formatListing(files, rootPath) {
  console.log(`${rootPath}\n`);
  let n = 1;
  for (const f of files) {
    const indent = '  '.repeat(f.depth);
    const suffix = f.isDir ? '/' : '';
    console.log(`${String(n).padStart(4)}  ${indent}${f.name}${suffix}`);
    n++;
  }
  console.log(`\n${files.length} entries`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  const ignoreIdx = args.indexOf('--ignore');
  const depthIdx = args.indexOf('--depth');

  const extraIgnore = ignoreIdx !== -1 ? args[ignoreIdx + 1].split(',') : [];
  const maxDepth = depthIdx !== -1 ? parseInt(args[depthIdx + 1], 10) : Infinity;
  const rootPath = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--ignore' && args[args.indexOf(a) - 1] !== '--depth') ?? '.';

  const ignore = [...DEFAULT_IGNORE, ...extraIgnore];
  const files = listFiles(rootPath, { ignore, maxDepth });

  if (args.includes('--json')) {
    console.log(JSON.stringify(files, null, 2));
  } else {
    formatListing(files, rootPath);
  }
}
