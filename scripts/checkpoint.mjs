#!/usr/bin/env node
// Checkpoint read/write for the checkpoint-resume pattern.
// Files land in ~/dev/checkpoints/<issueId>/<step>-<agent>.md
// Usage: node scripts/checkpoint.mjs write <issueId> <step>  (content read from stdin)
//        node scripts/checkpoint.mjs read  <issueId> <step>
//        node scripts/checkpoint.mjs list  <issueId>

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECKPOINTS_ROOT = join(homedir(), 'dev', 'checkpoints');

// Allowlist: exactly "NN-slug" where slug is lowercase letters/digits/hyphens.
// Rejects any input containing path separators or other traversal characters.
const STEP_RE = /^\d{2}-[a-z][a-z0-9-]*$/;

function assertStep(step) {
  if (!STEP_RE.test(step)) {
    throw new Error(`Invalid step "${step}" — must match NN-slug (e.g. "01-router")`);
  }
}

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
  assertStep(step);
  const dir = checkpointDir(issueId);
  mkdirSync(dir, { recursive: true });
  const agentSlug = step.replace(/^\d+-/, '');
  const filePath = join(dir, `${step}-${agentSlug}.md`);
  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

export function readCheckpoint(issueId, step) {
  assertStep(step);
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

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , cmd, issueId, step] = process.argv;

  function requireArgs(...names) {
    const vals = { cmd, issueId, step };
    const missing = names.filter(n => !vals[n]);
    if (missing.length) {
      console.error(`Missing required argument(s): ${missing.join(', ')}`);
      console.error('Usage: node scripts/checkpoint.mjs write|read|list <issueId> [step]');
      process.exit(1);
    }
  }

  if (cmd === 'write') {
    requireArgs('issueId', 'step');
    const content = await readStdin();
    const path = writeCheckpoint(issueId, step, content);
    console.log(`Checkpoint written: ${path}`);
  } else if (cmd === 'read') {
    requireArgs('issueId', 'step');
    const content = readCheckpoint(issueId, step);
    if (content === null) { console.log('null'); } else { process.stdout.write(content); }
  } else if (cmd === 'list') {
    requireArgs('issueId');
    const steps = listCheckpoints(issueId);
    console.log(steps.length ? steps.join('\n') : '(none)');
  } else {
    console.error('Usage: node scripts/checkpoint.mjs write|read|list <issueId> [step]');
    process.exit(1);
  }
}
