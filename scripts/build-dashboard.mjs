#!/usr/bin/env node
// Build the tool-health dashboard (ADR-019, ADR-021) → static HTML in --out: index.html, observations.html, evals.html, status.json
// Usage: node scripts/build-dashboard.mjs [--observations <dir>] [--out <dir>]
// Input: docs/observations/*.json sidecars (schema_version 1); the newest by `date` feeds the pages.
// Optional `review_chain` key: the `aggregate` of scripts/review-chain-metrics.mjs, shown as observational figures (not evals).
// Every string from the sidecars is escaped; no script, no external asset. Node ≥ 20, no external dependencies

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 1;
export const REPO_URL = 'https://github.com/koydas/ai-dev-tools';
// The companion dashboard, one tap away in the tab bar (ADR-021).
export const LOOP_DASHBOARD_URL = 'https://koydas.github.io/autonomous-dev-loop/';
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
    counts: Object.fromEntries(Object.keys(STATUS).map((k) => [k, obs.filter((o) => o.status === k).length])),
    followUp: [...obs].sort(byRank).slice(0, OVERVIEW_ITEMS),
    all: [...obs].sort(byRank),
    evidence: set.review_evidence ?? null,
    source: set.source ?? null,
    reviewChain: set.review_chain ?? null,
  };
}

/**
 * State of the toolbox in one word, as the overview's status line and status.json give it (ADR-021): `bad` when a
 * test fails or an observation is open, `warn` when one is not verified, else `ok`. `headline` says why.
 */
export function healthStatus(m) {
  const failing = m.tests.total - m.tests.passed;
  const { open, unverified } = m.counts;
  const status = failing || open ? 'bad' : unverified ? 'warn' : 'ok';
  const parts = [failing ? `${failing} test(s) failing` : '', open ? `${open} open` : '', unverified ? `${unverified} not verified` : ''].filter(Boolean);
  return { status, headline: parts.join(' · ') || 'all tests passing, nothing open' };
}

/** status.json: what the companion dashboard's switch can read (same shape as autonomous-dev-loop's). */
export function statusJson(m) {
  const { status, headline } = healthStatus(m);
  return `${JSON.stringify({ schema_version: 1, app: 'ai-dev-tools', generated_at: m.date, status, headline }, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Rendering (pure): model in, HTML string out
// ---------------------------------------------------------------------------

// Tokens and shell shared with the autonomous-dev-loop dashboard (ADR-021): same palette (scripts/lib/dashboard_ui.mjs
// there), header, phone tab bar and one-screen overview rows. Light / dark by prefers-color-scheme: no script here.
export const STYLE = `
:root { color-scheme: light dark; --bg: #f4f6fb; --surface: #fff; --ink: #101828; --ink-2: #475467; --muted: #667085; --border: #e3e8f0; --accent: #6941f5; --accent-bg: rgba(105,65,245,.10); --link: #2f5fe0;
  --good: #16a34a; --bad: #dc2626; --warn: #b45309; --neutral: #667085; --radius: 12px; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0a0f1d; --surface: #111a2c; --ink: #e8edf7; --ink-2: #b3bed3; --muted: #8190ab; --border: #22304b; --accent: #7c5cff; --accent-bg: rgba(124,92,255,.16); --link: #7aa7ff;
  --good: #22c55e; --bad: #f05252; --warn: #fbbf24; --neutral: #8190ab; } }
:root { --good-bg: color-mix(in srgb, var(--good) 14%, var(--surface)); --bad-bg: color-mix(in srgb, var(--bad) 14%, var(--surface)); --warn-bg: color-mix(in srgb, var(--warn) 14%, var(--surface)); --neutral-bg: color-mix(in srgb, var(--neutral) 14%, var(--surface)); }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
a { color: var(--link); text-decoration: none; } a:hover { text-decoration: underline; }
header { position: sticky; top: 0; z-index: 20; background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--border); }
.bar { max-width: 1120px; margin: 0 auto; padding: 10px 16px; display: flex; align-items: center; gap: 6px 22px; flex-wrap: wrap; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 750; font-size: 16px; color: var(--ink); letter-spacing: -.3px; white-space: nowrap; }
.brand-icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; color: #fff; background: linear-gradient(135deg,#8b5cf6,#6366f1); font-size: 16px; }
nav { display: flex; gap: 4px; flex: 1; overflow-x: auto; scrollbar-width: none; }
.bar nav a { color: var(--ink-2); padding: 8px 12px; border-radius: 8px; white-space: nowrap; }
.bar nav a[aria-current="page"] { color: var(--ink); background: var(--accent-bg); }
.tools { display: flex; gap: 14px; margin-left: auto; white-space: nowrap; }
main { max-width: 1120px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { margin: 0; font-size: 26px; } h2 { margin: 0; font-size: 18px; } .sub { color: var(--ink-2); margin: 4px 0 0; }
.head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 24px; align-items: end; margin-bottom: 24px; }
.grid { display: grid; gap: 16px; margin-bottom: 16px; } .g2 { grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr)); }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; margin-bottom: 16px; }
.big { font-size: 36px; font-weight: 700; line-height: 1.2; margin: 4px 0; } .big.text { font-size: 26px; }
.note { color: var(--muted); font-size: 13px; }
.card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 8px; }
ul.rows { list-style: none; margin: 0; padding: 0; } ul.rows li { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 12px 0; border-top: 1px solid var(--border); }
ul.rows li:first-child { border-top: 0; } .t { font-weight: 600; } .d { color: var(--ink-2); font-size: 13px; }
.pill { display: inline-block; padding: 2px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.good { color: var(--good); background: var(--good-bg); } .bad { color: var(--bad); background: var(--bad-bg); } .warn { color: var(--warn); background: var(--warn-bg); } .neutral { color: var(--neutral); background: var(--neutral-bg); }
ul.legend li { justify-content: flex-start; } .legend .pill { min-width: 128px; text-align: center; font-family: ui-monospace, monospace; }
.callout { background: var(--neutral-bg); color: var(--ink-2); border-radius: 8px; padding: 10px 14px; margin-top: 12px; font-size: 13px; }
.tag { background: var(--accent-bg); color: var(--accent); border-radius: 999px; padding: 1px 10px; font-size: 12px; margin-left: 8px; }
table { width: 100%; border-collapse: collapse; } td:last-child { white-space: nowrap; } th, td { text-align: left; padding: 10px 8px; border-top: 1px solid var(--border); vertical-align: top; } th { color: var(--muted); font-weight: 500; font-size: 13px; border-top: 0; }
tr:target td { background: var(--accent-bg); }
/* Overview: one phone screen (375 × ~630 CSS px), the rows of the autonomous-dev-loop home. */
.glance { max-width: 720px; }
.glance h1 { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.g-status { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; padding: 8px 10px; border: 1px solid var(--border); border-left: 5px solid var(--tone); border-radius: var(--radius); background: var(--surface); color: var(--ink); }
.g-status strong { display: block; color: var(--tone); font-size: 14px; } .g-status small { display: block; color: var(--ink-2); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.g-status > span:not(.chevron):not(.mark) { min-width: 0; flex: 1; }
.mark { display: grid; place-items: center; flex: none; width: 24px; height: 24px; border: 1.5px solid var(--tone); border-radius: 50%; color: var(--tone); font-size: 13px; font-weight: 700; }
.tone-good { --tone: var(--good); } .tone-bad { --tone: var(--bad); } .tone-warn { --tone: var(--warn); } .tone-neutral { --tone: var(--neutral); }
.g-row { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); margin: 0 0 8px; padding: 8px 10px; }
.g-head { display: grid; grid-template-columns: auto 1fr auto; grid-template-areas: 'label value chev' 'sub sub sub'; align-items: baseline; column-gap: 8px; color: var(--ink); }
.g-head:hover { text-decoration: none; }
.g-label { grid-area: label; font-size: 11px; font-weight: 650; color: var(--muted); text-transform: uppercase; letter-spacing: .4px; white-space: nowrap; }
.g-value { grid-area: value; justify-self: end; font-size: 18px; font-weight: 750; font-variant-numeric: tabular-nums; line-height: 1.2; white-space: nowrap; }
.g-sub { grid-area: sub; font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chevron { grid-area: chev; color: var(--muted); font-size: 18px; }
.g-chips { display: flex; flex-wrap: nowrap; gap: 6px; margin: 6px -10px 0; padding: 0 10px; overflow-x: auto; scrollbar-width: none; }
.g-chip { flex: none; display: inline-flex; align-items: center; min-height: 30px; padding: 2px 10px; border: 1px solid color-mix(in srgb, var(--tone) 40%, var(--border)); border-radius: 999px; background: color-mix(in srgb, var(--tone) 8%, var(--surface)); color: var(--ink); font-size: 12.5px; white-space: nowrap; }
.tabbar { display: none; }
@media (max-width: 760px) {
  .bar nav, .tools { display: none; } th:last-child, td:last-child { display: none; } .kv th:last-child, .kv td:last-child { display: table-cell; }
  main { padding-top: 10px; }
  .tabbar { display: grid; grid-template-columns: repeat(4, 1fr); position: fixed; bottom: 0; left: 0; right: 0; z-index: 25; background: var(--surface); border-top: 1px solid var(--border); padding: 4px 4px calc(4px + env(safe-area-inset-bottom)); }
  .tabbar a { display: grid; justify-items: center; gap: 2px; padding: 6px 2px; min-height: 44px; font-size: 10.5px; font-weight: 600; color: var(--muted); text-decoration: none; }
  .tabbar a[aria-current="page"] { color: var(--accent); }
  .tabbar svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  body { padding-bottom: 72px; }
}
footer { max-width: 1120px; margin: 0 auto; padding: 0 16px 32px; color: var(--muted); font-size: 13px; }
`;

const ICON = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  observations: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  evals: '<path d="M5 21V10M12 21V3M19 21v-7"/>',
  switch: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
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
  const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
  // Last slot: the switch to the autonomous-dev-loop dashboard (ADR-021).
  const tabs = PAGES.map((p) => link(p, `${icon(p.icon)}${e(p.label)}`)).join('') + `<a class="app-switch" href="${LOOP_DASHBOARD_URL}" title="autonomous-dev-loop dashboard">${icon('switch')}Loop</a>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(page.title)} — ai-dev-tools</title><style>${STYLE}</style></head>
<body><header><div class="bar">
<a class="brand" href="index.html"><span class="brand-icon" aria-hidden="true">⚒</span>AI Dev Tools</a>
<nav aria-label="Pages">${nav}</nav>
<span class="tools"><a href="${LOOP_DASHBOARD_URL}">Dev loop ⇄</a><a href="${REPO_URL}">Repository →</a></span>
</div></header>
<main>${bodyHtml}</main>
<nav class="tabbar" aria-label="Pages">${tabs}</nav>
<footer>Built from local observation reports of ${e(formatDate(model.date))}${model.source ? ` (<code>${e(model.source)}</code>)` : ''}. No aggregated history.</footer>
</body></html>
`;
}

const TONE = { ok: 'good', warn: 'warn', bad: 'bad' };
const TITLE = { ok: 'No problem detected', warn: 'Needs a check', bad: 'Attention needed' };
const MARK = { ok: '✓', warn: '!', bad: '✕' };
const chip = (href, tone, text) => `<a class="g-chip tone-${tone}" href="${href}">${e(text)}</a>`;
const row = (id, href, label, value, sub, chips = '') =>
  `<section class="g-row" id="g-${id}"><a class="g-head" href="${href}"><span class="g-label">${e(label)}</span><strong class="g-value">${e(value)}</strong><span class="g-sub">${e(sub)}</span><span class="chevron" aria-hidden="true">›</span></a>${chips ? `<div class="g-chips">${chips}</div>` : ''}</section>`;

/**
 * One phone screen (ADR-021): the status line, then tests, observations and quality, each row opening its page
 * and each chip a filtered view. The evidence vocabulary is on the Observations page.
 */
export function renderOverview(m) {
  const h = healthStatus(m);
  const failing = m.tests.total - m.tests.passed;
  const source = m.source ? `${REPO_URL}/blob/main/${m.source.split('/').map(encodeURIComponent).join('/')}` : 'observations.html';
  const pending = m.followUp.filter((o) => o.status === 'open' || o.status === 'unverified').slice(0, 3);
  const obsChips = pending.map((o) => chip(`observations.html#obs-${encodeURIComponent(o.id)}`, STATUS[o.status].tone, `${o.id} · ${o.title}`)).join('');
  const rc = m.reviewChain;
  const quality = rc
    ? row('quality', 'evals.html', 'Quality · review chain', `${rc.aggregate.reviewed} / ${rc.aggregate.prs}`, `PRs with a /pr-review report · observational, not evals`,
      // Under SMALL_SAMPLE reviewed PRs the Evals page says a rate cannot be read (ADR-020): no rate here either.
      rc.aggregate.reviewed < SMALL_SAMPLE
        ? chip('evals.html#review-chain', 'neutral', `only ${rc.aggregate.reviewed} reviewed PR${rc.aggregate.reviewed === 1 ? '' : 's'}: too few to read a rate`)
        : REVIEW_CHAIN.filter((x) => x.kind === 'rate').map((x) => chip('evals.html#review-chain', 'neutral', `${x.label.toLowerCase()} ${formatChainValue(x.kind, rc.aggregate[x.key])}`)).join(''))
    : row('quality', 'evals.html', 'Quality · evals', 'Not instrumented', 'No eval history is recorded yet');
  return layout('index.html', m, `<section class="glance" aria-label="Tool health">
<h1>Tool health</h1>
<a class="g-status tone-${TONE[h.status]}" href="observations.html"><span class="mark" aria-hidden="true">${MARK[h.status]}</span><span><strong>${e(TITLE[h.status])}</strong><small>${e(h.headline)} · ${e(formatDate(m.date))}</small></span><span class="chevron" aria-hidden="true">›</span></a>
${row('tests', source, 'Tests', `${m.tests.passed} / ${m.tests.total}`, `${failing ? `${failing} failing` : 'All passing'} · latest observation ${formatDate(m.date)}`)}
${row('observations', 'observations.html', 'Observations', `${m.fixed} fixed`, `${m.others} other${m.others === 1 ? '' : 's'} not conclusive`, obsChips)}
${quality}
</section>`);
}

function evidenceCard(m) {
  const evidence = EVIDENCE.map((x) => {
    const n = m.evidence?.[x.key];
    return `<li>${pill(x.tone, x.key)}<span>${e(x.text)}${Number.isInteger(n) ? ` <b>${n}</b>` : ''}</span></li>`;
  }).join('');
  return `<div class="card"><h2>Review evidence</h2><p class="sub">Statuses of the checks reported by the review agents.</p>
<ul class="rows legend">${evidence}</ul><div class="callout">Local reports only; aggregated history is not available.</div></div>`;
}

export function renderObservations(m) {
  const rows = m.all
    .map((o) => `<tr id="obs-${e(o.id)}"><td>${e(o.id)}</td><td><div class="t">${e(o.title)}</div><div class="d">${e(o.summary ?? '')}</div></td><td>${pill(STATUS[o.status].tone, STATUS[o.status].label)}</td><td>${e(formatDate(o.date))}</td></tr>`)
    .join('');
  return layout('observations.html', m, `
<div class="head"><div><h1>Observations</h1><p class="sub">Every finding of the latest session, open first.</p></div></div>
<div class="card"><table><thead><tr><th>ID</th><th>Observation</th><th>Status</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table></div>
${evidenceCard(m)}`);
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
<div class="card" id="review-chain"><div class="card-head"><h2>Review chain<span class="tag">observational</span></h2><span class="note">Generated ${e(formatDate(rc.generated))}</span></div>
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

/** Writes the three pages and status.json into `outDir`; returns the written file names. */
export function buildDashboard({ observationsDir, outDir }) {
  const set = loadLatestSet(observationsDir);
  if (!set) throw new Error(`no observation sidecar (*.json) in ${observationsDir}`);
  const model = summarize(set);
  const pages = { 'index.html': renderOverview, 'observations.html': renderObservations, 'evals.html': renderEvals };
  mkdirSync(outDir, { recursive: true });
  const files = Object.entries(pages).map(([file, render]) => {
    writeFileSync(join(outDir, file), render(model));
    return file;
  });
  writeFileSync(join(outDir, 'status.json'), statusJson(model));
  return [...files, 'status.json'];
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
