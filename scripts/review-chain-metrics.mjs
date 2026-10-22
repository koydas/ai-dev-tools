#!/usr/bin/env node
// Review-chain metrics (/pr-review → /pr-fixer) extracted from PR history → JSON
// Usage: node scripts/review-chain-metrics.mjs <pr-ref>... [--repo <owner/repo>] [--recent <n>]
//   <pr-ref>: 42 | #42 | owner/repo#42 | PR url. --recent <n>: the n latest closed PRs of --repo instead.
// Node ≥ 20, requires `gh` CLI authenticated. REST only (no GraphQL, so no ADR-011 fallback needed).
// Observational proxies, not ground truth: "touched" means a later commit changed the cited file, not
// that the finding was fixed; "beyond review" means a trusted human opened a thread on a file no report cited.
// A field the PR history cannot provide is `null` (unknown), never a default.

import { fileURLToPath } from 'node:url';
import { gh, restList, resolveRepo, exitOnUnknownFlag } from './gh-transport.mjs';
import { classifyComment } from './gh-get-pr-feedback.mjs';
import { parsePrRef } from './gh-get-pr.mjs';

const RESULTS = ['PASS', 'FAIL', 'NOT_RUN', 'PRE_EXISTING', 'N/A'];

// Pure: one `**[High · introduced]** `path:line` — …` list line → finding, null for anything else.
export function parseFinding(line) {
  const m = String(line).match(/^\s*(?:\d+\.|-)\s+\*\*\[([^\]]+)\]\*\*\s*`?([^`\s]+?)(?::(\d+))?`?\s+[—-]/);
  if (!m) return null;
  const [severity, origin, ...flags] = m[1].split('·').map((s) => s.trim().toLowerCase());
  return { severity, origin: origin ?? null, nit: flags.includes('nit'), path: m[2], line: m[3] ? Number(m[3]) : null };
}

// Pure: text between `**<from>**` and the next bold section title (or end).
function section(body, title) {
  const m = body.match(new RegExp(`\\*\\*${title}\\*\\*[^\\n]*\\n([\\s\\S]*?)(?=\\n\\*\\*[A-Z][^*\\n]*\\*\\*|\\n###|$)`));
  return m ? m[1] : '';
}

// Pure: a /pr-review report body (pr-analyst output) → structured report. Throws on a body without Status.
export function parseReport(body) {
  const status = String(body).match(/^### Status\s*\n\s*\[?(DONE|NEEDS_REVIEW|BLOCKED)\b/m)?.[1];
  if (!status) throw new Error('report has no ### Status line');
  const branch = body.match(/\*\*Branch\*\*:.*@\s*([0-9a-f]{7,40})/);
  const findings = (title) => section(body, title).split('\n').map(parseFinding).filter(Boolean);
  const evidence = Object.fromEntries(RESULTS.map((r) => [r, 0]));
  for (const row of section(body, 'Evidence').split('\n')) {
    const cells = row.split('|').map((c) => c.trim());
    const result = cells.length >= 5 ? RESULTS.find((r) => cells[4] === r || cells[4].startsWith(`${r} `) || cells[4].startsWith(`${r}—`)) : null;
    if (result) evidence[result] += 1;
  }
  return { status, headSha: branch?.[1] ?? null, blocking: findings('Blocking issues'), nonBlocking: findings('Non-blocking suggestions'), evidence };
}

// Pure: GitHub check runs → { success, failure, other } counts (null in = unknown).
export function summarizeChecks(runs) {
  if (!Array.isArray(runs)) return null;
  const out = { success: 0, failure: 0, other: 0 };
  for (const r of runs) {
    if (['success', 'neutral', 'skipped'].includes(r.conclusion)) out.success += 1;
    else if (['failure', 'timed_out', 'cancelled', 'action_required'].includes(r.conclusion)) out.failure += 1;
    else out.other += 1;
  }
  return out;
}

const sameSha = (a, b) => Boolean(a && b) && (a.startsWith(b) || b.startsWith(a));

// The compare endpoint lists at most 300 files for the whole comparison, whatever the pagination.
export const COMPARE_FILE_LIMIT = 300;

// Pure: compare response → paths a finding may cite (new and, for renames, previous names);
// null (unknown) when the list may be truncated.
export function changedFiles(cmp) {
  const files = cmp?.files;
  if (!Array.isArray(files) || files.length >= COMPARE_FILE_LIMIT) return null;
  return files.flatMap((f) => [f.filename, f.previous_filename]).filter(Boolean);
}

// Pure: commits pushed after `sha` (null when `sha` is not among the PR's commits).
export function afterCount(commits, sha) {
  const i = sha ? commits.findIndex((c) => sameSha(c.sha, sha)) : -1;
  return i === -1 ? null : commits.length - i - 1;
}

// Pure: raw PR facts → one record. `input`:
//   pr {number, state, merged, headSha, createdAt, mergedAt}
//   comments [{id, login, type, association, body, createdAt}]  (issue comments and review bodies, chronological)
//   threads [{path, login, type, association, createdAt}]        (thread roots)
//   commits [{sha, date}]                                        (PR commits, chronological)
//   filesSince {<sha>: string[] | null}                          (files changed from <sha> to PR head)
//   checks {<sha>: runs[] | null}
export function buildRecord({ pr, comments = [], threads = [], commits = [], filesSince = {}, checks = {} }) {
  const reports = comments
    .filter((c) => classifyComment({ login: c.login, type: c.type, association: c.association, body: c.body }) === 'pr-review')
    .map((c) => ({ ...parseReport(c.body), createdAt: c.createdAt }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const rounds = reports.map((r, i) => {
    const files = r.headSha ? Object.entries(filesSince).find(([sha]) => sameSha(sha, r.headSha))?.[1] ?? null : null;
    const all = [...r.blocking, ...r.nonBlocking];
    const touched = (f) => (files ? files.includes(f.path) : null);
    const count = (list) => (files ? list.filter(touched).length : null);
    return {
      round: i + 1,
      status: r.status,
      head_sha: r.headSha,
      blocking: r.blocking.length,
      non_blocking: r.nonBlocking.length,
      nits: all.filter((f) => f.nit).length,
      evidence: r.evidence,
      blocking_touched: count(r.blocking),
      non_blocking_touched: count(r.nonBlocking),
      commits_after: afterCount(commits, r.headSha),
    };
  });

  const cited = new Set(reports.flatMap((r) => [...r.blocking, ...r.nonBlocking].map((f) => f.path)));
  const first = reports[0]?.createdAt ?? null;
  // Same rule as /pr-fixer: a trusted human, not a bot, a generated comment or an outsider.
  const trusted = (t) => classifyComment({ login: t.login, type: t.type, association: t.association, body: t.body }) === 'human';
  const humanThreads = first ? threads.filter((t) => trusted(t) && t.createdAt > first) : [];
  const headChecks = Object.entries(checks).find(([sha]) => sameSha(sha, pr.headSha))?.[1];

  return {
    number: pr.number,
    merged: pr.merged,
    reviewed: reports.length > 0,
    rounds,
    final_status: rounds.at(-1)?.status ?? null,
    blocking_first: rounds[0]?.blocking ?? null,
    blocking_last: rounds.at(-1)?.blocking ?? null,
    human_threads_after_review: first ? humanThreads.length : null,
    human_threads_beyond_review: first ? humanThreads.filter((t) => !cited.has(t.path)).length : null,
    ci_head: summarizeChecks(headChecks),
    time_to_merge_h: pr.mergedAt ? Math.round((Date.parse(pr.mergedAt) - Date.parse(pr.createdAt)) / 36e5 * 10) / 10 : null,
  };
}

const ratio = (num, den) => (den ? Math.round((num / den) * 1000) / 1000 : null);

// Pure: records → aggregate. Only reviewed PRs enter the chain figures; ratios over an empty base are null.
export function aggregate(records) {
  const reviewed = records.filter((r) => r.reviewed);
  const known = (key) => reviewed.flatMap((r) => r.rounds.filter((x) => x[key] !== null));
  const sum = (rounds, key) => rounds.reduce((s, x) => s + x[key], 0);
  const withBlocking = known('blocking_touched');
  const withNonBlocking = known('non_blocking_touched');
  const humanKnown = reviewed.filter((r) => r.human_threads_after_review !== null);
  return {
    prs: records.length,
    reviewed: reviewed.length,
    reports: reviewed.reduce((s, r) => s + r.rounds.length, 0),
    blocking_touched_rate: ratio(sum(withBlocking, 'blocking_touched'), sum(withBlocking, 'blocking')),
    non_blocking_touched_rate: ratio(sum(withNonBlocking, 'non_blocking_touched'), sum(withNonBlocking, 'non_blocking')),
    converged_rate: ratio(reviewed.filter((r) => r.final_status === 'DONE').length, reviewed.length),
    mean_rounds: ratio(reviewed.reduce((s, r) => s + r.rounds.length, 0), reviewed.length),
    human_threads_beyond_review: humanKnown.reduce((s, r) => s + r.human_threads_beyond_review, 0),
    human_threads_after_review: humanKnown.reduce((s, r) => s + r.human_threads_after_review, 0),
  };
}

// Pure: a REST comment / review → the shape buildRecord reads (`path` only on review comments).
export const asMember = (c) => ({ id: c.id, path: c.path ?? null, login: c.user?.login ?? null, type: c.user?.type ?? null, association: c.author_association ?? null, body: c.body ?? '', createdAt: c.created_at ?? c.submitted_at });

// Fetches one PR's facts over REST and builds its record.
export function collectPr(number, repo) {
  const base = `repos/${resolveRepo(repo)}`;
  const pr = JSON.parse(gh(['api', `${base}/pulls/${number}`]));
  const issueComments = restList(`${base}/issues/${number}/comments`);
  const reviews = restList(`${base}/pulls/${number}/reviews`).filter((r) => r.body?.trim());
  const reviewComments = restList(`${base}/pulls/${number}/comments`).filter((c) => !c.in_reply_to_id);
  const commits = restList(`${base}/pulls/${number}/commits`).map((c) => ({ sha: c.sha, date: c.commit?.committer?.date }));
  const comments = [...issueComments, ...reviews].map(asMember).filter((c) => c.createdAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Files changed since each report's head (one compare per distinct report SHA).
  const shas = new Set();
  for (const c of comments) {
    if (classifyComment({ login: c.login, type: c.type, association: c.association, body: c.body }) !== 'pr-review') continue;
    try { const s = parseReport(c.body).headSha; if (s) shas.add(s); } catch { /* malformed report: no files */ }
  }
  const filesSince = {};
  for (const sha of shas) {
    try {
      const full = commits.find((c) => sameSha(c.sha, sha))?.sha ?? sha;
      const cmp = JSON.parse(gh(['api', `${base}/compare/${full}...${pr.head.sha}`]));
      filesSince[sha] = changedFiles(cmp);
    } catch { filesSince[sha] = null; }
  }
  const checks = {};
  try { checks[pr.head.sha] = restList(`${base}/commits/${pr.head.sha}/check-runs`).flatMap((p) => p.check_runs ?? []); } catch { checks[pr.head.sha] = null; }

  return buildRecord({
    pr: { number, state: pr.state, merged: pr.merged === true, headSha: pr.head.sha, createdAt: pr.created_at, mergedAt: pr.merged_at },
    comments, commits, filesSince, checks,
    threads: reviewComments.map(asMember),
  });
}

const USAGE = 'Usage: node scripts/review-chain-metrics.mjs <pr-ref>... [--repo <owner/repo>] [--recent <n>]';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  exitOnUnknownFlag(args, { value: ['--repo', '--recent'] }, USAGE);
  const valueOf = (flag) => { const i = args.indexOf(flag); return i === -1 ? undefined : args[i + 1]; };
  const repo = valueOf('--repo');
  const recent = valueOf('--recent');
  const positional = args.filter((a, i) => !a.startsWith('-') && !['--repo', '--recent'].includes(args[i - 1]));

  try {
    let refs = positional.map(parsePrRef);
    if (recent) {
      if (!/^\d+$/.test(recent) || Number(recent) < 1 || Number(recent) > 100) throw new Error('--recent expects a number between 1 and 100 (one REST page)');
      const closed = JSON.parse(gh(['api', `repos/${resolveRepo(repo)}/pulls?state=closed&per_page=${recent}`]));
      refs = closed.map((p) => ({ number: p.number, repo: undefined }));
    }
    if (!refs.length) { console.error(USAGE); process.exit(1); }
    const records = refs.map((r) => ({ repo: resolveRepo(r.repo ?? repo), ...collectPr(r.number, r.repo ?? repo) }));
    console.log(JSON.stringify({ schema_version: 1, generated: new Date().toISOString().slice(0, 10), aggregate: aggregate(records), prs: records }, null, 2));
  } catch (err) {
    console.error('Error collecting review-chain metrics:', err.message);
    process.exit(1);
  }
}
