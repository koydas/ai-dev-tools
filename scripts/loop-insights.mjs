#!/usr/bin/env node
// Fetch, validate and bound the autonomous-dev-loop findings export for /loop-insights (ADR-017) → JSON on stdout
// Usage: node scripts/loop-insights.mjs [--source <https-url|path>] [--finding <key>]
// The source defaults to findings_url in configs/meta-loop.yaml. No token is read or sent; no scheme but https.
// The export is data: free-text fields can hold model-originated text, so they stay JSON strings inside a JSON
// document and are never concatenated into prose here. Unknown fields are dropped, not forwarded.
// Node ≥ 20, no external dependencies

import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadMetaLoopConfig } from './config.mjs';

export const SUPPORTED_SCHEMA_VERSION = 1;
export const MAX_BYTES = 2 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 15000;
export const EVIDENCE_SHOWN = 5;
export const SUMMARY_MAX = 200;

const USAGE = 'Usage: node scripts/loop-insights.mjs [--source <https-url|path>] [--finding <key>]';
const STATUSES = ['critical', 'warning', 'ok', 'no_data'];
const SEVERITIES = ['info', 'warning', 'critical'];
const FINDING_STATUSES = ['active', 'resolved'];
const REQUIRES = ['evals', 'no-eval-gate', 'docs-and-tests'];
const TARGET_REQUIRES = ['evals', 'no-eval-gate'];
const CAPS = { findings: 200, evidence: 25, gaps: 100, targets: 20, adr: 20, requires: 3 };

// ---------------------------------------------------------------------------
// Validation (pure): every check names the path of the field it rejects
// ---------------------------------------------------------------------------

const fail = (path, why) => { throw new Error(`invalid export: ${path} ${why}`); };
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const object = (v, path) => (isObject(v) ? v : fail(path, 'must be an object'));
const array = (v, path, cap) => {
  if (!Array.isArray(v)) fail(path, 'must be an array');
  if (v.length > cap) fail(path, `has ${v.length} entries, over the cap of ${cap}`);
  return v;
};
const string = (v, path, max) => {
  if (typeof v !== 'string') fail(path, 'must be a string');
  if (v.length > max) fail(path, `is ${v.length} characters, over the cap of ${max}`);
  return v;
};
const nullable = (check) => (v, path, ...rest) => (v === null || v === undefined ? null : check(v, path, ...rest));
const stamp = (v, path) => (Number.isFinite(v) ? v : fail(path, 'must be a finite number'));
const oneOf = (v, path, values) => (values.includes(v) ? v : fail(path, `must be one of ${values.join(', ')}`));

function lever(v, path) {
  const l = object(v, path);
  if (l.verified !== false) fail(`${path}.verified`, 'must be false: a lever is advice, never a verified cause');
  return {
    stage: string(l.stage, `${path}.stage`, 40),
    summary: string(l.summary, `${path}.summary`, 500),
    targets: array(l.targets, `${path}.targets`, CAPS.targets).map((t, i) => {
      const p = `${path}.targets[${i}]`;
      object(t, p);
      return {
        kind: oneOf(t.kind, `${p}.kind`, ['config', 'variable', 'prompt', 'policy', 'external']),
        ref: string(t.ref, `${p}.ref`, 300),
        gate: nullable(string)(t.gate, `${p}.gate`, 40),
        requires: oneOf(t.requires, `${p}.requires`, TARGET_REQUIRES),
      };
    }),
    adr: array(l.adr, `${path}.adr`, CAPS.adr).map((a, i) => string(a, `${path}.adr[${i}]`, 20)),
    requires: array(l.requires, `${path}.requires`, CAPS.requires).map((r, i) => oneOf(r, `${path}.requires[${i}]`, REQUIRES)),
    verified: false,
  };
}

function finding(v, path) {
  const f = object(v, path);
  return {
    key: string(f.key, `${path}.key`, 120),
    category: string(f.category, `${path}.category`, 80),
    title: string(f.title, `${path}.title`, 300),
    severity: oneOf(f.severity, `${path}.severity`, SEVERITIES),
    status: oneOf(f.status, `${path}.status`, FINDING_STATUSES),
    first_seen: nullable(stamp)(f.first_seen, `${path}.first_seen`),
    last_seen: nullable(stamp)(f.last_seen, `${path}.last_seen`),
    clean_since: nullable(stamp)(f.clean_since, `${path}.clean_since`),
    fact: string(f.fact, `${path}.fact`, 5000),
    hypothesis: nullable(string)(f.hypothesis, `${path}.hypothesis`, 5000),
    impact: string(f.impact, `${path}.impact`, 1000),
    frequency: string(f.frequency, `${path}.frequency`, 1000),
    evidence: array(f.evidence, `${path}.evidence`, CAPS.evidence).map((e, i) => {
      const p = `${path}.evidence[${i}]`;
      object(e, p);
      return {
        run_id: string(e.run_id, `${p}.run_id`, 80),
        ts: nullable(stamp)(e.ts, `${p}.ts`),
        event: nullable(string)(e.event, `${p}.event`, 120),
        summary: string(e.summary ?? '', `${p}.summary`, 2000),
        pr: nullable(stamp)(e.pr, `${p}.pr`),
      };
    }),
    lever: nullable(lever)(f.lever, `${path}.lever`),
  };
}

/**
 * Pure: the export's text → the validated export, unknown fields dropped. Throws, naming the field, on a
 * version it does not know or a shape it does not accept.
 */
export function parseExport(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('invalid export: not JSON'); }
  object(raw, 'export');
  if (raw.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(`unsupported schema_version ${JSON.stringify(raw.schema_version)} (this command supports ${SUPPORTED_SCHEMA_VERSION}): update ai-dev-tools or the export`);
  }
  const w = object(raw.window, 'window');
  return {
    schema_version: SUPPORTED_SCHEMA_VERSION,
    generated_at: string(raw.generated_at, 'generated_at', 40),
    window: { from: nullable(stamp)(w.from, 'window.from'), to: nullable(stamp)(w.to, 'window.to'), runs: stamp(w.runs, 'window.runs') },
    status: oneOf(raw.status, 'status', STATUSES),
    findings: array(raw.findings, 'findings', CAPS.findings).map((f, i) => finding(f, `findings[${i}]`)),
    gaps: array(raw.gaps, 'gaps', CAPS.gaps).map((g, i) => {
      object(g, `gaps[${i}]`);
      return { id: string(g.id, `gaps[${i}].id`, 80), title: string(g.title, `gaps[${i}].title`, 300) };
    }),
  };
}

// ---------------------------------------------------------------------------
// Selection (pure): what the agent drafts from, and what it only reports
// ---------------------------------------------------------------------------

const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);
const cut = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// Why a finding has no proposal, from the export alone (ADR-0047: a lever exists only for an active
// warning / critical finding of a mapped rule).
function whyNoLever(f) {
  if (f.status === 'resolved') return 'resolved';
  if (f.severity === 'info') return 'info';
  return 'no_lever';
}

/**
 * Pure: the validated export → the agent's input. `key` limits it to one finding; an unknown key throws.
 * Findings with a lever carry bounded evidence (count, the first EVIDENCE_SHOWN entries, summaries cut);
 * the others are listed with the reason they have no proposal. Gaps are a count and titles.
 */
export function selectFindings(exported, key) {
  const all = exported.findings;
  if (key !== undefined && !all.some((f) => f.key === key)) {
    throw new Error(`unknown finding key ${JSON.stringify(key)}; the export has: ${all.map((f) => f.key).join(', ') || 'no finding'}`);
  }
  const chosen = key === undefined ? all : all.filter((f) => f.key === key);
  const proposable = chosen.filter((f) => f.lever);
  return {
    generated_at: exported.generated_at,
    window: { from: iso(exported.window.from), to: iso(exported.window.to), runs: exported.window.runs },
    status: exported.status,
    total_findings: all.length,
    selected: chosen.length,
    findings: proposable.map((f) => ({
      key: f.key, severity: f.severity, first_seen: iso(f.first_seen), last_seen: iso(f.last_seen),
      fact: f.fact, hypothesis: f.hypothesis, lever: f.lever,
      evidence: {
        count: f.evidence.length,
        shown: f.evidence.slice(0, EVIDENCE_SHOWN).map((e) => ({ run_id: e.run_id, ts: iso(e.ts), event: e.event, summary: cut(e.summary, SUMMARY_MAX), pr: e.pr })),
      },
    })),
    not_proposed: chosen.filter((f) => !f.lever).map((f) => ({ key: f.key, severity: f.severity, status: f.status, clean_since: iso(f.clean_since), reason: whyNoLever(f) })),
    gaps: { count: exported.gaps.length, titles: exported.gaps.map((g) => g.title) },
  };
}

// ---------------------------------------------------------------------------
// Source (I/O): https URL or local path, bounded in size and time
// ---------------------------------------------------------------------------

/** Pure: how a `--source` value is read. Only https and a plain path; any other scheme is refused. */
export function classifySource(source) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('source must be a non-empty string');
  if (source.startsWith('-')) throw new Error('source must not start with "-"');
  // A single letter before ":" is a Windows drive (C:\findings.json), not a scheme.
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]+):/.exec(source)?.[1]?.toLowerCase();
  if (!scheme) return { kind: 'file', path: source };
  if (scheme !== 'https') throw new Error(`unsupported source scheme "${scheme}:": only https:// or a local path`);
  return { kind: 'https', url: source };
}

async function readBounded(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`export is ${declared} bytes, over the cap of ${maxBytes}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error(`export is over the cap of ${maxBytes} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Read the export text from `source`. `deps` lets tests replace the network and the file system. */
export async function readSource(source, { fetchImpl = globalThis.fetch, read = readFileSync, stat = statSync, timeoutMs = FETCH_TIMEOUT_MS, maxBytes = MAX_BYTES } = {}) {
  const target = classifySource(source);
  if (target.kind === 'file') {
    const { size } = stat(target.path);
    if (size > maxBytes) throw new Error(`export is ${size} bytes, over the cap of ${maxBytes}`);
    return read(target.path, 'utf8');
  }
  let response;
  try {
    response = await fetchImpl(target.url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
  } catch (err) {
    throw new Error(`cannot reach ${target.url}: ${err.name === 'TimeoutError' ? `no answer in ${timeoutMs} ms` : err.message}`);
  }
  if (!String(response.url || target.url).startsWith('https://')) throw new Error('refused: the request was redirected away from https');
  if (!response.ok) throw new Error(`cannot read ${target.url}: HTTP ${response.status}`);
  return readBounded(response, maxBytes);
}

/** Parse the CLI arguments: --source, --finding, both optional, each with a value. */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!['--source', '--finding'].includes(flag)) throw new Error(`unknown argument ${JSON.stringify(flag)}`);
    if (value === undefined || value.startsWith('-')) throw new Error(`${flag} needs a value`);
    if (out[flag.slice(2)] !== undefined) throw new Error(`${flag} given twice`);
    out[flag.slice(2)] = value;
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const text = await readSource(args.source ?? loadMetaLoopConfig().findings_url);
    console.log(JSON.stringify(selectFindings(parseExport(text), args.finding), null, 2));
  } catch (err) {
    console.error(`${err.message}\n${USAGE}`);
    process.exit(1);
  }
}
