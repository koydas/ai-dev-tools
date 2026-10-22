#!/usr/bin/env node
// Build the tool-health dashboard (ADR-019) → static HTML in --out: index.html, observations.html, evals.html
// Usage: node scripts/build-dashboard.mjs [--observations <dir>] [--out <dir>]
// Input: docs/observations/*.json sidecars (schema_version 1); the newest by `date` feeds the pages.
// Optional `review_chain` key: the `aggregate` of scripts/review-chain-metrics.mjs, shown as observational figures (not evals).
// Every string from the sidecars is escaped; no script, no external asset. Node ≥ 20, no external dependencies

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 1;
export const REPO_URL = 'https://github.com/koydas/ai-dev-tools';
const USAGE = 'Usage: node scripts/build-dashboard.mjs [--observations <dir>] [--out <dir>]';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// open sorts first: it is what the reader has to act on.
export const STATUS = {
  open: { label: 'Open', tone: 'bad', rank: 0 },
  unverified: { label: 'Not verified', tone: 'neutral', rank: 1 },
  fixed: { label: 'Fixed', tone: 'good', rank: 2 },
  not_applicable: { label: 'Not applicable', tone: 'neutral', rank: 3 },
};

// Same vocabulary as the Evidence table of pr-analyst / code-reviewer.
export const EVIDENCE = [
  { key: 'PASS', tone: 'good', text: 'Check ran and passed.' },
  { key: 'FAIL', tone: 'bad', text: 'Check ran and failed on the change.' },
  { key: 'NOT_RUN', tone: 'neutral', text: 'Check exists but was not executed in this session.' },
  { key: 'PRE_EXISTING', tone: 'warn', text: 'Already failing on the base branch (not caused by the change).' },
];

// Review-chain figures (aggregate of scripts/review-chain-metrics.mjs). Proxies from PR history, not eval scores.
export const REVIEW_CHAIN = [
  { key: 'blocking_touched_rate', kind: 'rate', label: 'Blocking findings touched', text: 'Share of blocking findings whose cited file a later commit changed. A proxy for fixed, not proof.' },
  { key: 'non_blocking_touched_rate', kind: 'rate', label: 'Non-blocking findings touched', text: 'Same measure for non-blocking findings and nits.' },
  { key: 'converged_rate', kind: 'rate', label: 'Converged', text: 'Share of reviewed PRs whose last report is DONE.' },
  { key: 'mean_rounds', kind: 'number', label: 'Reports per reviewed PR', text: 'Review rounds before the PR ended.' },
  { key: 'human_threads_beyond_review', kind: 'count', label: 'Human threads beyond the review', text: 'Threads from trusted humans, after the first report, on files no report cited. A proxy for what the review missed.' },
];

// Below this many reviewed PRs the page says a rate cannot be read. A display threshold, not a statistical bound.
export const SMALL_SAMPLE = 10;

const OVERVIEW_ITEMS = 4;

export const escapeHtml = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const e = escapeHtml;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `2026-10-22` → `Oct 22, 2026`; anything else is returned as is. */
export function formatDate(iso) {
  const m = ISO_DATE.exec(String(iso));
  return m && MONTHS[Number(m[2]) - 1] ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : String(iso);
}

// ---------------------------------------------------------------------------
// Validation (pure): every error names the path of the field it rejects
// ---------------------------------------------------------------------------

const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const isCount = (v) => Number.isInteger(v) && v >= 0;

/** Throws on the first invalid field; returns the data unchanged (unknown fields are ignored by the renderers). */
export function validateObservationSet(data, name = 'observations') {
  const fail = (path, why) => {
    throw new Error(`${name}: ${path} ${why}`);
  };
  if (data === null || typeof data !== 'object' || Array.isArray(data)) fail('$', 'must be an object');
  if (data.schema_version !== SCHEMA_VERSION) fail('schema_version', `must be ${SCHEMA_VERSION}`);
  if (!isStr(data.date) || !ISO_DATE.test(data.date)) fail('date', 'must be YYYY-MM-DD');
  const t = data.tests;
  if (t === null || typeof t !== 'object') fail('tests', 'must be an object');
  if (!isCount(t.passed)) fail('tests.passed', 'must be a non-negative integer');
  if (!isCount(t.total)) fail('tests.total', 'must be a non-negative integer');
  if (t.passed > t.total) fail('tests.passed', 'must not exceed tests.total');
  if (!Array.isArray(data.observations)) fail('observations', 'must be an array');
  const ids = new Set();
  data.observations.forEach((o, i) => {
    const p = `observations[${i}]`;
    if (o === null || typeof o !== 'object') fail(p, 'must be an object');
    if (!isStr(o.id)) fail(`${p}.id`, 'must be a non-empty string');
    if (ids.has(o.id)) fail(`${p}.id`, `duplicates ${o.id}`);
    ids.add(o.id);
    if (!isStr(o.title)) fail(`${p}.title`, 'must be a non-empty string');
    if (o.summary !== undefined && typeof o.summary !== 'string') fail(`${p}.summary`, 'must be a string');
    if (!Object.hasOwn(STATUS, o.status)) fail(`${p}.status`, `must be one of ${Object.keys(STATUS).join(', ')}`);
    if (!ISO_DATE.test(String(o.date))) fail(`${p}.date`, 'must be YYYY-MM-DD');
  });
  if (data.review_chain !== undefined) validateReviewChain(data.review_chain, fail);
  return data;
}

const isRatio = (v) => v === null || (typeof v === 'number' && v >= 0 && v <= 1);

// Pure: the optional `review_chain` key. Rates are null (unknown) or in [0, 1]; counts are integers.
function validateReviewChain(rc, fail) {
  if (rc === null || typeof rc !== 'object' || Array.isArray(rc)) fail('review_chain', 'must be an object');
  if (!ISO_DATE.test(String(rc.generated))) fail('review_chain.generated', 'must be YYYY-MM-DD');
  if (rc.scope !== undefined && !isStr(rc.scope)) fail('review_chain.scope', 'must be a non-empty string');
  const a = rc.aggregate;
  if (a === null || typeof a !== 'object' || Array.isArray(a)) fail('review_chain.aggregate', 'must be an object');
  for (const key of ['prs', 'reviewed', 'reports', 'human_threads_after_review', 'human_threads_beyond_review']) {
    if (!isCount(a[key])) fail(`review_chain.aggregate.${key}`, 'must be a non-negative integer');
  }
  if (a.reviewed > a.prs) fail('review_chain.aggregate.reviewed', 'must not exceed prs');
  if (a.human_threads_beyond_review > a.human_threads_after_review) fail('review_chain.aggregate.human_threads_beyond_review', 'must not exceed human_threads_after_review');
  for (const key of ['blocking_touched_rate', 'non_blocking_touched_rate', 'converged_rate']) {
    if (!isRatio(a[key])) fail(`review_chain.aggregate.${key}`, 'must be null or a number between 0 and 1');
  }
  if (!(a.mean_rounds === null || (typeof a.mean_rounds === 'number' && a.mean_rounds >= 0))) fail('review_chain.aggregate.mean_rounds', 'must be null or a non-negative number');
}

/** Newest set by `date` (ties: last file name), or null when the directory holds none. */
export function loadLatestSet(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const sets = files.map((f) => {
    let data;
    try {
      data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch (err) {
      throw new Error(`${f}: invalid JSON (${err.message})`);
    }
    return validateObservationSet(data, f);
  });
  return sets.reduce((best, s) => (best === null || s.date >= best.date ? s : best), null);
}

// ---------------------------------------------------------------------------
// Model (pure)
// ---------------------------------------------------------------------------

export function summarize(set) {
  const obs = set.observations;
  const fixed = obs.filter((o) => o.status === 'fixed').length;
  const byRank = (a, b) => STATUS[a.status].rank - STATUS[b.status].rank;
  return {
    date: set.date,
    tests: set.tests,
    fixed,
    others: obs.length - fixed,
    followUp: [...obs].sort(byRank).slice(0, OVERVIEW_ITEMS),
    all: [...obs].sort(byRank),
    evidence: set.review_evidence ?? null,
    source: set.source ?? null,
    reviewChain: set.review_chain ?? null,
  };
}

// ---------------------------------------------------------------------------
// Rendering (pure): model in, HTML string out
// ---------------------------------------------------------------------------

export const STYLE = `
:root { --bg: #f6f7fb; --surface: #fff; --ink: #0f1230; --ink-2: #4b5170; --muted: #7a809c; --border: #e6e8f2; --accent: #4353e8; --accent-bg: #eceefd;
  --good: #0f8a4f; --good-bg: #e3f6ec; --bad: #d1243b; --bad-bg: #fde8eb; --warn: #b86e00; --warn-bg: #fff1d6; --neutral: #5d637f; --neutral-bg: #eceef5; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0d0f1c; --surface: #151829; --ink: #eef0fb; --ink-2: #b4b9d6; --muted: #868cab; --border: #262a42; --accent: #8b97ff; --accent-bg: #222850;
  --good: #46d38c; --good-bg: #123325; --bad: #ff6b81; --bad-bg: #3a1620; --warn: #ffb547; --warn-bg: #3a2a0e; --neutral: #a3a9c6; --neutral-bg: #222640; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }
header { background: var(--surface); border-bottom: 1px solid var(--border); }
.bar { max-width: 1120px; margin: 0 auto; padding: 0 16px; display: flex; align-items: center; gap: 24px; min-height: 64px; }
.brand { display: flex; flex-direction: column; line-height: 1.15; color: var(--ink); } .brand b { letter-spacing: .04em; } .brand small { color: var(--muted); }
nav { display: flex; gap: 4px; flex: 1; overflow-x: auto; scrollbar-width: none; }
.bar nav a { color: var(--ink-2); padding: 20px 12px 18px; border-bottom: 2px solid transparent; white-space: nowrap; }
.bar nav a[aria-current="page"] { color: var(--ink); border-bottom-color: var(--accent); }
main { max-width: 1120px; margin: 0 auto; padding: 32px 16px 48px; }
h1 { margin: 0; font-size: 30px; } h2 { margin: 0; font-size: 18px; } .sub { color: var(--ink-2); margin: 4px 0 0; }
.head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 24px; align-items: end; margin-bottom: 24px; }
.grid { display: grid; gap: 16px; margin-bottom: 16px; } .g3 { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); } .g2 { grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr)); }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
.card .label { color: var(--ink-2); } .big { font-size: 36px; font-weight: 700; line-height: 1.2; margin: 4px 0; } .big.text { font-size: 26px; }
.card .note { color: var(--muted); font-size: 13px; }
.card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 8px; }
ul.rows { list-style: none; margin: 0; padding: 0; } ul.rows li { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 12px 0; border-top: 1px solid var(--border); }
ul.rows li:first-child { border-top: 0; } .t { font-weight: 600; } .d { color: var(--ink-2); font-size: 13px; }
.pill { display: inline-block; padding: 2px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.good { color: var(--good); background: var(--good-bg); } .bad { color: var(--bad); background: var(--bad-bg); } .warn { color: var(--warn); background: var(--warn-bg); } .neutral { color: var(--neutral); background: var(--neutral-bg); }
.when { display: block; color: var(--muted); font-size: 12px; text-align: right; margin-top: 2px; }
ul.legend li { justify-content: flex-start; } .legend .pill { min-width: 128px; text-align: center; font-family: ui-monospace, monospace; }
.callout { background: var(--neutral-bg); color: var(--ink-2); border-radius: 8px; padding: 10px 14px; margin-top: 12px; font-size: 13px; }
.tag { background: var(--accent-bg); color: var(--accent); border-radius: 999px; padding: 1px 10px; font-size: 12px; margin-left: 8px; }
table { width: 100%; border-collapse: collapse; } td:last-child { white-space: nowrap; } th, td { text-align: left; padding: 10px 8px; border-top: 1px solid var(--border); vertical-align: top; } th { color: var(--muted); font-weight: 500; font-size: 13px; border-top: 0; }
.tabbar { display: none; }
@media (max-width: 760px) {
  .bar nav { display: none; } .bar { min-height: 56px; } th:last-child, td:last-child { display: none; } .kv th:last-child, .kv td:last-child { display: table-cell; }
  .tabbar { display: grid; grid-template-columns: repeat(3, 1fr); position: fixed; bottom: 0; left: 0; right: 0; z-index: 25; background: var(--surface); border-top: 1px solid var(--border); padding: 4px 4px calc(4px + env(safe-area-inset-bottom)); }
  .tabbar a { display: grid; justify-items: center; gap: 2px; padding: 6px 2px; min-height: 44px; font-size: 11px; font-weight: 600; color: var(--muted); text-decoration: none; }
  .tabbar a[aria-current="page"] { color: var(--accent); }
  .tabbar svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  body { padding-bottom: 72px; }
}
footer { max-width: 1120px; margin: 0 auto; padding: 0 16px 32px; color: var(--muted); font-size: 13px; }
`;

const ICON = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  observations: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  evals: '<path d="M5 21V10M12 21V3M19 21v-7"/>',
};

const PAGES = [
  { file: 'index.html', label: 'Overview', title: 'Tool health', icon: 'overview' },
  { file: 'observations.html', label: 'Observations', title: 'Observations', icon: 'observations' },
  { file: 'evals.html', label: 'Evals', title: 'Agent evals', icon: 'evals' },
];

/** Rate → `50%` (one decimal at most), null → `n/a`. */
export const formatRate = (v) => (v === null ? 'n/a' : `${Math.round(v * 1000) / 10}%`);

const formatChainValue = (kind, v) => (v === null ? 'n/a' : kind === 'rate' ? formatRate(v) : String(v));

const pill = (tone, text) => `<span class="pill ${tone}">${e(text)}</span>`;

function layout(current, model, bodyHtml) {
  const page = PAGES.find((p) => p.file === current);
  const link = (p, inner) => `<a href="${p.file}"${p.file === current ? ' aria-current="page"' : ''}>${inner}</a>`;
  const nav = PAGES.map((p) => link(p, e(p.label))).join('');
  const tabs = PAGES.map((p) => link(p, `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[p.icon]}</svg>${e(p.label)}`)).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(page.title)} — ai-dev-tools</title><style>${STYLE}</style></head>
<body><header><div class="bar">
<a class="brand" href="index.html"><b>AI DEV TOOLS</b><small>koydas</small></a>
<nav aria-label="Pages">${nav}</nav>
<a href="${REPO_URL}">GitHub ↗</a>
</div></header>
<main>${bodyHtml}</main>
<nav class="tabbar" aria-label="Pages">${tabs}</nav>
<footer>Built from local observation reports of ${e(formatDate(model.date))}${model.source ? ` (<code>${e(model.source)}</code>)` : ''}. No aggregated history.</footer>
</body></html>
`;
}

const observationRow = (o) =>
  `<li><div><div class="t">${e(o.title)}</div><div class="d">${e(o.summary ?? '')}</div></div>` +
  `<div>${pill(STATUS[o.status].tone, STATUS[o.status].label)}<span class="when">${e(formatDate(o.date))}</span></div></li>`;

export function renderOverview(m) {
  const allPass = m.tests.passed === m.tests.total;
  const evidence = EVIDENCE.map((x) => {
    const n = m.evidence?.[x.key];
    return `<li>${pill(x.tone, x.key)}<span>${e(x.text)}${Number.isInteger(n) ? ` <b>${n}</b>` : ''}</span></li>`;
  }).join('');
  const rc = m.reviewChain;
  const reviewChainCard = rc
    ? `
<div class="card"><div class="label">Review chain</div><div class="big">${rc.aggregate.reviewed} / ${rc.aggregate.prs}</div>
<div class="note">PRs with a /pr-review report · <a href="evals.html">observational figures</a></div></div>`
    : '';
  return layout('index.html', m, `
<div class="head"><div><h1>Tool health</h1><p class="sub">Overview based on the latest local observations.</p></div>
<span class="note">Last updated: ${e(formatDate(m.date))}</span></div>
<div class="grid g3">
<div class="card"><div class="label">Tests run</div><div class="big">${m.tests.passed} / ${m.tests.total}</div>
<div class="note">${allPass ? 'All passing' : `${m.tests.total - m.tests.passed} failing`} · latest observation ${e(formatDate(m.date))}</div></div>
<div class="card"><div class="label">Observations fixed</div><div class="big">${m.fixed}</div>
<div class="note">${m.others} other${m.others === 1 ? '' : 's'} not conclusive</div></div>
<div class="card"><div class="label">Agent evals</div><div class="big text">Not instrumented</div>
<div class="note">No eval history is recorded yet.</div></div>${reviewChainCard}
</div>
<div class="grid g2">
<div class="card"><div class="card-head"><h2>Follow-up</h2><a href="observations.html">See all →</a></div>
<p class="sub">Open and unverified first, from the latest session.</p><ul class="rows">${m.followUp.map(observationRow).join('')}</ul></div>
<div class="card"><h2>Review evidence</h2><p class="sub">Statuses of the checks reported by the review agents.</p>
<ul class="rows legend">${evidence}</ul><div class="callout">Local reports only; aggregated history is not available.</div></div>
</div>
<div class="card"><h2>Agent trends<span class="tag">to be wired</span></h2>
<p class="sub">Agent evals will show up here once instrumentation is in place.</p></div>`);
}

export function renderObservations(m) {
  const rows = m.all
    .map((o) => `<tr><td>${e(o.id)}</td><td><div class="t">${e(o.title)}</div><div class="d">${e(o.summary ?? '')}</div></td><td>${pill(STATUS[o.status].tone, STATUS[o.status].label)}</td><td>${e(formatDate(o.date))}</td></tr>`)
    .join('');
  return layout('observations.html', m, `
<div class="head"><div><h1>Observations</h1><p class="sub">Every finding of the latest session, open first.</p></div></div>
<div class="card"><table><thead><tr><th>ID</th><th>Observation</th><th>Status</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

function reviewChainSection(rc) {
  const a = rc.aggregate;
  const rows = REVIEW_CHAIN.map(
    (x) => `<tr><td><div class="t">${e(x.label)}</div><div class="d">${e(x.text)}</div></td><td><b>${e(formatChainValue(x.kind, a[x.key]))}</b></td></tr>`,
  ).join('');
  const caution = a.reviewed < SMALL_SAMPLE
    ? `<div class="callout">Only ${a.reviewed} reviewed PR${a.reviewed === 1 ? '' : 's'}: too few to read a rate.</div>`
    : '';
  return `
<div class="card"><div class="card-head"><h2>Review chain<span class="tag">observational</span></h2><span class="note">Generated ${e(formatDate(rc.generated))}</span></div>
<p class="sub">/pr-review → /pr-fixer, extracted from PR history${rc.scope ? ` (${e(rc.scope)})` : ''}: ${a.reviewed} of ${a.prs} PRs carry a report, ${a.reports} report${a.reports === 1 ? '' : 's'} in all.</p>
${caution}
<table class="kv"><thead><tr><th>Figure</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>
<div class="callout">These are proxies from PR history, not eval scores: there is no ground truth, and "touched" does not mean "fixed".</div></div>`;
}

export function renderEvals(m) {
  return layout('evals.html', m, `
<div class="head"><div><h1>Agent evals</h1><p class="sub">Success rate and latency per agent.</p></div></div>
<div class="card"><div class="big text">Not instrumented</div>
<p class="sub">No eval set is versioned for the agents yet, so there is nothing to chart. This page stays empty rather than showing invented numbers.</p></div>${m.reviewChain ? reviewChainSection(m.reviewChain) : ''}`);
}

// ---------------------------------------------------------------------------
// Build + CLI
// ---------------------------------------------------------------------------

/** Writes the three pages into `outDir`; returns the written file names. */
export function buildDashboard({ observationsDir, outDir }) {
  const set = loadLatestSet(observationsDir);
  if (!set) throw new Error(`no observation sidecar (*.json) in ${observationsDir}`);
  const model = summarize(set);
  const pages = { 'index.html': renderOverview, 'observations.html': renderObservations, 'evals.html': renderEvals };
  mkdirSync(outDir, { recursive: true });
  return Object.entries(pages).map(([file, render]) => {
    writeFileSync(join(outDir, file), render(model));
    return file;
  });
}

export function parseArgs(argv) {
  const out = { observations: join(ROOT, 'docs', 'observations'), out: join(ROOT, '_site') };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag !== '--observations' && flag !== '--out') throw new Error(`unknown option ${flag}`);
    const value = argv[++i];
    if (!value || value.startsWith('-')) throw new Error(`${flag} needs a value`);
    out[flag.slice(2)] = resolve(value);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const a = parseArgs(process.argv.slice(2));
    const files = buildDashboard({ observationsDir: a.observations, outDir: a.out });
    console.log(`Wrote ${files.join(', ')} to ${a.out}`);
  } catch (err) {
    console.error(`Error: ${err.message}\n${USAGE}`);
    process.exit(1);
  }
}
