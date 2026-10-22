#!/usr/bin/env node
// PR feedback /pr-fixer acts on → JSON: the latest /pr-review report posted on the PR and the
// comments, reviews and unresolved threads written by humans with a role on the repository
// (OWNER / MEMBER / COLLABORATOR). Everything else is never applied: bots are counted, and
// generated, untrusted and unknown items are listed so the caller can surface them (ADR-014).
// Usage: node scripts/gh-get-pr-feedback.mjs <pr-number> [--repo <owner/repo>]
// Node ≥ 20, requires `gh` CLI authenticated. Threads and resolution state come from
// gh-get-pr-threads.mjs (GraphQL, else REST — ADR-011); author type (`user.type`) and role
// (`author_association`) from REST, which both transports reach. The REST lists are fetched once
// and reused by the REST fallback of gh-get-pr-threads.mjs.

import { fileURLToPath } from 'node:url';
import { restList, resolveRepo, exitOnUnknownFlag } from './gh-transport.mjs';
import { getPrThreads } from './gh-get-pr-threads.mjs';

// Same trust rule as autonomous-dev-loop's isTrustedReviewComment (its ADR-0028): anyone can
// comment on a public PR, so only a role on the repository makes text an instruction.
export const TRUSTED_ASSOCIATIONS = ['OWNER', 'MEMBER', 'COLLABORATOR'];

// A /pr-review report (pr-analyst output).
const isPrReviewReport = (body) =>
  /^\s*### Status\s*$/m.test(body) && /^### Review\s*$/m.test(body) && /\*\*Evidence\*\*/.test(body);

// Signatures of comments written by a tool on a human account.
const GENERATED_PATTERNS = [
  /Generated (by|with) \[Claude Code\]/,
  /<!--\s*[a-z][\w-]*\s+[\w-]+=[^>]*-->/, // machine marker, e.g. <!-- adl-review sha=… verdict=… -->
];

// Pure: one comment → 'bot' | 'pr-review' | 'generated' | 'human' | 'untrusted' | 'unknown'.
// Only 'pr-review' and 'human' are ever applied.
export function classifyComment({ login = null, type = null, association = null, body = '' } = {}) {
  const text = body ?? '';
  if (type === 'Bot' || /\[bot\]$/.test(login ?? '')) return 'bot';
  const trusted = TRUSTED_ASSOCIATIONS.includes(association);
  if (isPrReviewReport(text)) return trusted ? 'pr-review' : 'untrusted';
  if (GENERATED_PATTERNS.some((re) => re.test(text))) return 'generated';
  if (type === 'User') return trusted ? 'human' : 'untrusted';
  return 'unknown';
}

// Pure: REST items (issue comments, review comments, reviews) → Map of id and node_id →
// { type, association }.
export function authorIndex(items) {
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

const NOT_APPLIED = ['generated', 'untrusted', 'unknown'];

// Pure: gh-get-pr-threads.mjs output + author index → the feedback /pr-fixer reads.
export function selectFeedback(activity, index) {
  if (!activity || !Array.isArray(activity.threads)) throw new Error('expected gh-get-pr-threads output with threads');
  if (!(index instanceof Map)) throw new Error('expected an author index (Map)');
  const classify = (id, login, body) => classifyComment({ login, body, ...(id == null ? {} : index.get(String(id))) });
  const excluded = { bot: 0 };
  const notApplied = { generated: [], untrusted: [], unknown: [] };
  const setAside = (cls, item) => {
    if (cls === 'bot') excluded.bot += 1;
    else if (NOT_APPLIED.includes(cls)) notApplied[cls].push(item);
  };

  const prReviews = [];
  const comments = [];
  for (const c of activity.prComments ?? []) {
    const login = c.author?.login ?? null;
    const cls = classify(c.id, login, c.body);
    const item = { id: c.id, author: login, body: c.body, createdAt: c.createdAt, url: c.url ?? null };
    if (cls === 'pr-review') prReviews.push(item);
    else if (cls === 'human') comments.push(item);
    else setAside(cls, item);
  }

  const reviews = [];
  for (const r of activity.reviews ?? []) {
    if (!r.body?.trim()) continue; // approval / state change without text: nothing to act on
    const login = r.author?.login ?? null;
    const cls = classify(r.id, login, r.body);
    const item = { id: r.id, author: login, state: r.state, body: r.body, submittedAt: r.submittedAt };
    if (cls === 'human') reviews.push(item);
    else if (cls === 'pr-review') prReviews.push({ ...item, createdAt: r.submittedAt, url: null });
    else setAside(cls, item);
  }

  const threads = [];
  for (const t of activity.threads) {
    if (t.resolved === true) continue; // settled on GitHub
    const all = [{ id: t.id, author: t.author, body: t.body, createdAt: t.createdAt }, ...(t.replies ?? [])]
      .map((c, i) => ({ ...c, class: classify(c.id, c.author, c.body), root: i === 0 }));
    const requests = all.filter((c) => c.class === 'human' || c.class === 'pr-review');
    const located = (c) => ({ id: c.id, author: c.author, body: c.body, path: t.path, line: t.line });
    if (!requests.length) {
      all.forEach((c) => setAside(c.class, located(c)));
      continue;
    }
    // Requests only, plus a bot root as the context a human answered; any other comment is set aside.
    const kept = all.filter((c) => requests.includes(c) || (c.root && c.class === 'bot'));
    all.filter((c) => !kept.includes(c)).forEach((c) => setAside(c.class, located(c)));
    threads.push({
      id: t.id, threadId: t.threadId, path: t.path, line: t.line, resolved: t.resolved, outdated: t.outdated,
      comments: kept.map(({ root, ...c }) => c),
    });
  }

  const latest = prReviews.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).at(-1) ?? null;
  return { source: activity.source ?? null, latestPrReview: latest, human: { comments, reviews, threads }, notApplied, excluded };
}

export function getPrFeedback(prNumber, repo) {
  const ownerRepo = resolveRepo(repo);
  const base = `repos/${ownerRepo}`;
  const prefetched = {
    issueComments: restList(`${base}/issues/${prNumber}/comments`),
    reviewComments: restList(`${base}/pulls/${prNumber}/comments`),
    reviews: restList(`${base}/pulls/${prNumber}/reviews`),
  };
  const activity = getPrThreads(prNumber, ownerRepo, prefetched);
  return selectFeedback(activity, authorIndex(Object.values(prefetched).flat()));
}

const USAGE = 'Usage: node scripts/gh-get-pr-feedback.mjs <pr-number> [--repo <owner/repo>]';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  exitOnUnknownFlag(args, { value: ['--repo'] }, USAGE);
  const number = args.find((a) => /^\d+$/.test(a));
  const repoIdx = args.indexOf('--repo');
  const repo = repoIdx !== -1 ? args[repoIdx + 1] : undefined;

  if (!number) {
    console.error(USAGE);
    process.exit(1);
  }

  try {
    console.log(JSON.stringify(getPrFeedback(number, repo), null, 2));
  } catch (err) {
    console.error(`Error fetching feedback for PR #${number}:`, err.message);
    process.exit(1);
  }
}
