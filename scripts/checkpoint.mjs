#!/usr/bin/env node
// Checkpoint read/write for the checkpoint-resume pattern.
// Files land in ~/dev/checkpoints/<issueId>/<step>-<agent>.md
// Usage: node scripts/checkpoint.mjs write <issueId> <step> <content>
//        node scripts/checkpoint.mjs read  <issueId> <step>
//        node scripts/checkpoint.mjs list  <issueId>

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECKPOINTS_ROOT = join(homedir(), 'dev', 'checkpoints');

function checkpointDir(issueId) {
  return join(CHECKPOINTS_ROOT, String(issueId));
}

function findFile(dir, step) {
  if (!existsSync(dir)) return null;
  const prefix = `${step}-`;
  const match = readdirSync(dir).find(f => f.startsWith(prefix) && f.endsWith('.md'));
  return match ? join(dir, match) : null;
}

export function writeCheckpoint(issueId, step, content) {
  const dir = checkpointDir(issueId);
  mkdirSync(dir, { recursive: true });
  // Derive agent slug from step label (e.g. "01-router" → "router")
  const agentSlug = step.replace(/^\d+-/, '');
  const filePath = join(dir, `${step}-${agentSlug}.md`);
  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

export function readCheckpoint(issueId, step) {
  const file = findFile(checkpointDir(issueId), step);
  if (!file) return null;
  return readFileSync(file, 'utf8');
}

export function listCheckpoints(issueId) {
  const dir = checkpointDir(issueId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, '').replace(/-[^-]+$/, ''))
    .sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , cmd, issueId, step, ...rest] = process.argv;

  if (cmd === 'write') {
    const content = rest.join(' ');
    const path = writeCheckpoint(issueId, step, content);
    console.log(`Checkpoint written: ${path}`);
  } else if (cmd === 'read') {
    const content = readCheckpoint(issueId, step);
    if (content === null) { console.log('null'); } else { process.stdout.write(content); }
  } else if (cmd === 'list') {
    const steps = listCheckpoints(issueId);
    console.log(steps.length ? steps.join('\n') : '(none)');
  } else {
    console.error('Usage: node scripts/checkpoint.mjs write|read|list <issueId> [step] [content]');
    process.exit(1);
  }
}
