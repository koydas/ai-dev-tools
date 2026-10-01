#!/usr/bin/env node
// Fetch the CI check runs of a commit → JSON. Used by the review commands to give the reviewer
// agents the base branch's CI results, so they can mark a failure PRE_EXISTING without calling
// GitHub themselves (ADR-007, ADR-009).
// Usage: node scripts/gh-get-check-runs.mjs (<sha> | --merge-base [<ref>]) [--repo <owner/repo>]
//   --merge-base [<ref>]  resolve `git merge-base <ref> HEAD` locally; <ref> defaults to
//                         <remote>/<default_branch> from configs/git.yaml
// Node ≥ 20, requires `gh` CLI authenticated

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadGitConfig } from './config.mjs';

const USAGE = 'Usage: node scripts/gh-get-check-runs.mjs (<sha> | --merge-base [<ref>]) [--repo <owner/repo>]';
const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

// Pure: CLI arguments → { sha } | { mergeBase } plus optional repo. Throws on invalid input.
export function parseArgs(argv, { defaultRef } = {}) {
  const args = [...argv];
  let repo;
  const repoIdx = args.indexOf('--repo');
  if (repoIdx !== -1) {
    repo = args[repoIdx + 1];
    if (!repo || repo.startsWith('--')) throw new Error('--repo requires <owner/repo>');
    args.splice(repoIdx, 2);
  }
  const mbIdx = args.indexOf('--merge-base');
  if (mbIdx !== -1) {
    const next = args[mbIdx + 1];
    const ref = next && !next.startsWith('--') ? next : defaultRef;
    args.splice(mbIdx, next && !next.startsWith('--') ? 2 : 1);
    if (args.length) throw new Error(`unexpected argument with --merge-base: ${args[0]}`);
    if (!ref) throw new Error('--merge-base requires a ref when no default branch is configured');
    return { mergeBase: ref, repo };
  }
  if (args.length !== 1) throw new Error(USAGE);
  if (!SHA_PATTERN.test(args[0])) throw new Error(`not a commit SHA: ${args[0]}`);
  return { sha: args[0], repo };
}

// Pure: one check run from the GitHub API → the fields the agents use.
export function normalizeCheckRun(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string') {
    throw new Error('check run without a name');
  }
  return {
    name: raw.name,
    status: raw.status ?? null,
    conclusion: raw.conclusion ?? null, // null while the run is not completed
    html_url: raw.html_url ?? null,
  };
}

// Pure: `gh api --paginate --jq '.check_runs[]'` prints one JSON object per line, across pages.
export function parseCheckRunLines(text) {
  return String(text ?? '')
    .split('\n')
    .map((line, i) => [line.trim(), i + 1])
    .filter(([line]) => line)
    .map(([line, lineNo]) => {
      let raw;
      try {
        raw = JSON.parse(line);
      } catch (err) {
        throw new Error(`invalid check run JSON on line ${lineNo}: ${err.message}`);
      }
      return normalizeCheckRun(raw);
    });
}

export function resolveMergeBase(ref) {
  return execFileSync('git', ['merge-base', ref, 'HEAD'], { encoding: 'utf8' }).trim();
}

export function getCheckRuns(sha, repo) {
  // `{owner}/{repo}` is filled in by gh from the current repo when --repo is not given.
  const endpoint = `repos/${repo ?? '{owner}/{repo}'}/commits/${sha}/check-runs?per_page=100`;
  const out = execFileSync('gh', ['api', '--paginate', '--jq', '.check_runs[]', endpoint], { encoding: 'utf8' });
  return parseCheckRunLines(out);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { remote, default_branch: branch } = loadGitConfig();
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2), { defaultRef: branch ? `${remote}/${branch}` : undefined });
  } catch (err) {
    console.error(err.message === USAGE ? USAGE : `${err.message}\n${USAGE}`);
    process.exit(1);
  }

  try {
    const sha = parsed.sha ?? resolveMergeBase(parsed.mergeBase);
    console.log(JSON.stringify({ sha, check_runs: getCheckRuns(sha, parsed.repo) }, null, 2));
  } catch (err) {
    console.error('Error fetching check runs:', err.message);
    process.exit(1);
  }
}
