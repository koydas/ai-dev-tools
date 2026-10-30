#!/usr/bin/env node
// Fetch the CI check runs of a commit → JSON. Used by the review commands to give the reviewer
// agents the base branch's CI results, so they can mark a failure PRE_EXISTING without calling
// GitHub themselves (ADR-007, ADR-009).
// Usage: node scripts/gh-get-check-runs.mjs (<sha> | --merge-base [<ref>] [--head <sha>]) [--repo <owner/repo>]
//   --merge-base [<ref>]  resolve `git merge-base <ref> HEAD` locally; <ref> defaults to
//                         <remote>/<default_branch> from configs/git.yaml
//   --head <sha>          resolve the merge-base of <ref> (a branch of --repo, e.g. `main`; defaults to
//                         <default_branch>) and <sha> through the compare API instead — no local clone
//                         involved, so it is the merge-base in --repo whatever the working directory
// Node ≥ 20, requires `gh` CLI authenticated

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadGitConfig } from './config.mjs';

const USAGE = 'Usage: node scripts/gh-get-check-runs.mjs (<sha> | --merge-base [<ref>] [--head <sha>]) [--repo <owner/repo>]';
const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

// Pure: CLI arguments → { sha } | { mergeBase } | { mergeBase, head } plus optional repo. Throws on invalid input.
export function parseArgs(argv, { defaultRef, defaultBranch } = {}) {
  const args = [...argv];
  let repo;
  const repoIdx = args.indexOf('--repo');
  if (repoIdx !== -1) {
    repo = args[repoIdx + 1];
    if (!repo || repo.startsWith('--')) throw new Error('--repo requires <owner/repo>');
    args.splice(repoIdx, 2);
  }
  let head;
  const headIdx = args.indexOf('--head');
  if (headIdx !== -1) {
    head = args[headIdx + 1];
    if (!head || head.startsWith('--')) throw new Error('--head requires a commit SHA');
    if (!SHA_PATTERN.test(head)) throw new Error(`--head is not a commit SHA: ${head}`);
    args.splice(headIdx, 2);
  }
  const mbIdx = args.indexOf('--merge-base');
  if (mbIdx !== -1) {
    const next = args[mbIdx + 1];
    // With --head the ref is a branch of the remote repo, not a local remote-tracking ref.
    const ref = next && !next.startsWith('--') ? next : (head === undefined ? defaultRef : defaultBranch);
    args.splice(mbIdx, next && !next.startsWith('--') ? 2 : 1);
    if (args.length) throw new Error(`unexpected argument with --merge-base: ${args[0]}`);
    if (!ref) throw new Error('--merge-base requires a ref when no default branch is configured');
    if (head === undefined) return { mergeBase: ref, repo };
    // The ref goes into an API path: a git ref never holds `..`, whitespace or a leading `-`.
    if (ref.startsWith('-') || ref.includes('..') || /\s/.test(ref)) throw new Error(`not a branch name: ${ref}`);
    return { mergeBase: ref, head, repo };
  }
  if (head !== undefined) throw new Error('--head requires --merge-base');
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

// Pure: compare endpoint whose `merge_base_commit` is the merge-base of <base> and <head> in <repo>.
// `{owner}/{repo}` is filled in by gh from the current repo when no repo is given.
export function compareEndpoint(base, head, repo) {
  return `repos/${repo ?? '{owner}/{repo}'}/compare/${base}...${head}`;
}

// Pure: output of `gh api <compare> --jq .merge_base_commit.sha` → the SHA. Throws on anything else.
export function parseMergeBaseSha(text) {
  const sha = String(text ?? '').trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('compare response without merge_base_commit.sha');
  return sha;
}

// No --paginate: pages only split `commits`; merge_base_commit is the same on every page.
export function resolveMergeBaseRemote(base, head, repo) {
  const endpoint = `${compareEndpoint(base, head, repo)}?per_page=1`;
  return parseMergeBaseSha(execFileSync('gh', ['api', '--jq', '.merge_base_commit.sha', endpoint], { encoding: 'utf8' }));
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
    parsed = parseArgs(process.argv.slice(2), { defaultRef: branch ? `${remote}/${branch}` : undefined, defaultBranch: branch });
  } catch (err) {
    console.error(err.message === USAGE ? USAGE : `${err.message}\n${USAGE}`);
    process.exit(1);
  }

  try {
    const sha = parsed.sha
      ?? (parsed.head ? resolveMergeBaseRemote(parsed.mergeBase, parsed.head, parsed.repo) : resolveMergeBase(parsed.mergeBase));
    console.log(JSON.stringify({ sha, check_runs: getCheckRuns(sha, parsed.repo) }, null, 2));
  } catch (err) {
    console.error('Error fetching check runs:', err.message);
    process.exit(1);
  }
}
