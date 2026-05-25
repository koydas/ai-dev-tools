#!/usr/bin/env node
// Checkpoint read/write for the checkpoint-resume pattern.
// Files land in ~/dev/checkpoints/<owner>/<repo>/<issueId>/<step>.md
// Usage: node scripts/checkpoint.mjs write --repo <owner/repo> <issueId> <step>  (content from stdin)
//        node scripts/checkpoint.mjs read  --repo <owner/repo> <issueId> <step>
//        node scripts/checkpoint.mjs list  --repo <owner/repo> <issueId>

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECKPOINTS_ROOT = join(homedir(), 'dev', 'checkpoints');

// Allowlist patterns — reject anything containing path separators or traversal sequences.
const REPO_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const ISSUE_ID_RE = /^\d+$/;
const STEP_RE = /^\d{2}-[a-z][a-z0-9-]*$/;

function assertRepo(repo) {
  if (!REPO_RE.test(String(repo))) {
    throw new Error(`Invalid repo "${repo}" — must be owner/repo (e.g. "acme/my-app")`);
  }
}

function assertIssueId(issueId) {
  if (!ISSUE_ID_RE.test(String(issueId))) {
    throw new Error(`Invalid issueId "${issueId}" — must be a positive integer`);
  }
}

function assertStep(step) {
  if (!STEP_RE.test(step)) {
    throw new Error(`Invalid step "${step}" — must match NN-slug (e.g. "01-router")`);
  }
}

function checkpointDir(repo, issueId) {
  const [owner, repoName] = repo.split('/');
  return join(CHECKPOINTS_ROOT, owner, repoName, String(issueId));
}

export function writeCheckpoint(repo, issueId, step, content) {
  assertRepo(repo);
  assertIssueId(issueId);
  assertStep(step);
  const dir = checkpointDir(repo, issueId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const filePath = join(dir, `${step}.md`);
  writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });
  return filePath;
}

export function readCheckpoint(repo, issueId, step) {
  assertRepo(repo);
  assertIssueId(issueId);
  assertStep(step);
  const filePath = join(checkpointDir(repo, issueId), `${step}.md`);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf8');
}

export function listCheckpoints(repo, issueId) {
  assertRepo(repo);
  assertIssueId(issueId);
  const dir = checkpointDir(repo, issueId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.md') && STEP_RE.test(f.slice(0, -3)))
    .map(f => f.slice(0, -3))
    .sort();
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const repoIdx = args.indexOf('--repo');
  const repo = repoIdx !== -1 ? args[repoIdx + 1] : undefined;
  const positional = args.filter((_, i) => i !== 0 && i !== repoIdx && i !== repoIdx + 1);
  const [issueId, step] = positional;

  function requireArgs(...names) {
    const vals = { cmd, repo, issueId, step };
    const missing = names.filter(n => !vals[n]);
    if (missing.length) {
      console.error(`Missing required argument(s): ${missing.join(', ')}`);
      console.error('Usage: node scripts/checkpoint.mjs write|read|list --repo <owner/repo> <issueId> [step]');
      process.exit(1);
    }
  }

  if (cmd === 'write') {
    requireArgs('repo', 'issueId', 'step');
    const content = await readStdin();
    const path = writeCheckpoint(repo, issueId, step, content);
    console.log(`Checkpoint written: ${path}`);
  } else if (cmd === 'read') {
    requireArgs('repo', 'issueId', 'step');
    const content = readCheckpoint(repo, issueId, step);
    if (content === null) {
      console.error(`Checkpoint not found: ${repo}/${issueId}/${step}`);
      process.exit(1);
    }
    process.stdout.write(content);
  } else if (cmd === 'list') {
    requireArgs('repo', 'issueId');
    const steps = listCheckpoints(repo, issueId);
    console.log(steps.length ? steps.join('\n') : '(none)');
  } else {
    console.error('Usage: node scripts/checkpoint.mjs write|read|list --repo <owner/repo> <issueId> [step]');
    process.exit(1);
  }
}
