#!/usr/bin/env node
// PR feedback /pr-fixer acts on → JSON: the latest /pr-review report posted on the PR and the
// comments, reviews and unresolved threads written by humans. Bots, generated comments (Claude
// Code footer, pipeline markers) and authors of unknown type are left out — unknown ones are
// listed so the caller can surface them (ADR-014). Only the repo's owner, members and collaborators
// are trusted: a report or a request from anyone else is listed as unknown, never applied.
// Usage: node scripts/gh-get-pr-feedback.mjs <pr-number> [--repo <owner/repo>]
// Node ≥ 20, requires `gh` CLI authenticated. Threads and resolution state come from
// gh-get-pr-threads.mjs (GraphQL, else REST — ADR-011); author types (`user.type`) from REST,
// which both transports reach.

import { fileURLToPath } from 'node:url';
import { restList, resolveRepo } from './gh-transport.mjs';
import { getPrThreads } from './gh-get-pr-threads.mjs';

// A /pr-review report (pr-analyst output), whoever posted it.
const isPrReviewReport = (body) =>
  /^\s*### Status\s*$/m.test(body) && /^### Review\s*$/m.test(body) && /\*\*Evidence\*\*/.test(body);

// Signatures of comments written by a tool on a human account.
const GENERATED_PATTERNS = [
  /Generated (by|with) \[Claude Code\]/,
  /<!--\s*[a-z][\w-]*\s+[\w-]+=[^>]*-->/, // machine marker, e.g. <!-- adl-review sha=… verdict=… -->
];

// REST `author_association` values whose text /pr-fixer may act on; any other (CONTRIBUTOR, NONE, …)
// or a missing one is untrusted.
const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

// Pure: one comment → 'pr-review' | 'bot' | 'generated' | 'human' | 'unknown'.
// A report or a human comment from an untrusted author is 'unknown': anyone can post on a public PR.
export function classifyComment({ login = null, type = null, association = null, body = '' } = {}) {
  const text = body ?? '';
  const trusted = TRUSTED_ASSOCIATIONS.has(association);
  if (isPrReviewReport(text)) return trusted ? 'pr-review' : 'unknown';
  if (type === 'Bot' || /\[bot\]$/.test(login ?? '')) return 'bot';
  if (GENERATED_PATTERNS.some((re) => re.test(text))) return 'generated';
  if (type === 'User') return trusted ? 'human' : 'unknown';
  return 'unknown';
}

// Pure: REST items (issue comments, review comments, reviews) → Map of id and node_id →
// { type: user.type, association: author_association }.
export function authorTypeIndex(items) {
  if (!Array.isArray(items)) throw new Error('expected an array of REST items');
  const index = new Map();
  for (const item of items) {
    const type = item?.user?.type ?? null;
    if (!type) continue;
    const author = { type, association: item.author_association ?? null };
    if (item.id != null) index.set(String(item.id), author);
    if (item.node_id) index.set(String(item.node_id), author);
  }
  return index;
}

// Pure: gh-get-pr-threads.mjs output + author type index → the feedback /pr-fixer reads.
export function selectFeedback(activity, typeIndex) {
  if (!activity || !Array.isArray(activity.threads)) throw new Error('expected gh-get-pr-threads output with threads');
  if (!(typeIndex instanceof Map)) throw new Error('expected an author type index (Map)');
  const authorOf = (id) => (id == null ? null : typeIndex.get(String(id)) ?? null);
  const classify = (id, login, body) => {
    const author = authorOf(id);
    return classifyComment({ login, type: author?.type ?? null, association: author?.association ?? null, body });
  };
  const excluded = { bot: 0, generated: 0 };
  const unknown = [];
  const tally = (cls, item) => {
    if (cls === 'bot' || cls === 'generated') excluded[cls] += 1;
    if (cls === 'unknown') unknown.push(item);
  };

  const prReviews = [];
  const comments = [];
  for (const c of activity.prComments ?? []) {
    const login = c.author?.login ?? null;
    const cls = classify(c.id, login, c.body);
    const item = { id: c.id, author: login, body: c.body, createdAt: c.createdAt, url: c.url ?? null };
    if (cls === 'pr-review') prReviews.push(item);
    else if (cls === 'human') comments.push(item);
    else tally(cls, item);
  }

  const reviews = [];
  for (const r of activity.reviews ?? []) {
    if (!r.body?.trim()) continue; // approval / state change without text: nothing to act on
    const login = r.author?.login ?? null;
    const cls = classify(r.id, login, r.body);
    const item = { id: r.id, author: login, state: r.state, body: r.body, submittedAt: r.submittedAt };
    if (cls === 'human') reviews.push(item);
    else if (cls === 'pr-review') prReviews.push({ ...item, createdAt: r.submittedAt, url: null });
    else tally(cls, item);
  }

  const threads = [];
  for (const t of activity.threads) {
    if (t.resolved === true) continue; // settled on GitHub
    const all = [{ id: t.id, author: t.author, body: t.body, createdAt: t.createdAt }, ...(t.replies ?? [])]
      .map((c) => ({ ...c, class: classify(c.id, c.author, c.body) }));
    if (!all.some((c) => c.class === 'human' || c.class === 'pr-review')) {
      all.forEach((c) => tally(c.class, { id: c.id, author: c.author, body: c.body, path: t.path, line: t.line }));
      continue;
    }
    // Kept whole: a bot root a human answered is the context of the human's request.
    threads.push({ id: t.id, threadId: t.threadId, path: t.path, line: t.line, resolved: t.resolved, outdated: t.outdated, comments: all });
  }

  const latest = prReviews.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).at(-1) ?? null;
  return { source: activity.source ?? null, latestPrReview: latest, human: { comments, reviews, threads }, unknown, excluded };
}

export function getPrFeedback(prNumber, repo) {
  const ownerRepo = resolveRepo(repo);
  const activity = getPrThreads(prNumber, ownerRepo);
  const base = `repos/${ownerRepo}`;
  const index = authorTypeIndex([
    ...restList(`${base}/issues/${prNumber}/comments`),
    ...restList(`${base}/pulls/${prNumber}/comments`),
    ...restList(`${base}/pulls/${prNumber}/reviews`),
  ]);
  return selectFeedback(activity, index);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const number = args.find((a) => /^\d+$/.test(a));
  const repoIdx = args.indexOf('--repo');
  const repo = repoIdx !== -1 ? args[repoIdx + 1] : undefined;

  if (!number) {
    console.error('Usage: node scripts/gh-get-pr-feedback.mjs <pr-number> [--repo <owner/repo>]');
    process.exit(1);
  }

  try {
    console.log(JSON.stringify(getPrFeedback(number, repo), null, 2));
  } catch (err) {
    console.error(`Error fetching feedback for PR #${number}:`, err.message);
    process.exit(1);
  }
}
