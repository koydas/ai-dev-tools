// Grade a code-reviewer output against an eval case (evals/code-reviewer/cases.json) — library, no CLI.
// A case is a real defect: `head` is the PR state where the finding existed, `fixed_head` the commit that
// fixed it. Variant `defect` (review of `head`) passes when the reviewer blocks on the finding; variant
// `fixed` (review of `fixed_head`) passes when it does not report that finding again.
// "Reports the finding" = a Bugs / regressions or Blocking issues item naming `finding.path` AND matching
// `finding.pattern` (case-insensitive). Deterministic, no LLM judge. Node ≥ 20

import { checkAgentOutput, parseSections } from './check-agent-output.mjs';

const SHA = /^[0-9a-f]{40}$/;
const SOURCE = /^PR #[1-9][0-9]*$/;
const ID = /^[a-z0-9][a-z0-9-]*$/;
const VARIANTS = ['defect', 'fixed'];
const BLOCKING_TITLES = [/^Bugs \/ regressions/i, /^Blocking issues/i];
const REVIEWER_STATUSES = ['DONE', 'NEEDS_REVIEW'];

// Pure: dataset → array of "<path>: <problem>" (empty when valid). Names the offending field, like build-dashboard.
export function validateCases(doc) {
  const errors = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);
  if (doc?.schema_version !== 1) err('schema_version', 'must be 1');
  if (!Array.isArray(doc?.cases) || !doc.cases.length) return [...errors, 'cases: must be a non-empty array'];
  const ids = new Set();
  doc.cases.forEach((c, i) => {
    const at = (f) => `cases[${i}].${f}`;
    if (typeof c?.id !== 'string' || !ID.test(c.id)) err(at('id'), 'must match [a-z0-9-]+');
    else if (ids.has(c.id)) err(at('id'), `duplicate "${c.id}"`);
    else ids.add(c.id);
    if (c?.agent !== 'code-reviewer') err(at('agent'), 'must be "code-reviewer"');
    if (typeof c?.source !== 'string' || !SOURCE.test(c.source)) err(at('source'), 'must be "PR #<n>"');
    if (!Array.isArray(c?.ac) || !c.ac.length || c.ac.some((a) => typeof a !== 'string' || !a.trim())) err(at('ac'), 'must be a non-empty array of strings');
    for (const f of ['base', 'head', 'fixed_head']) if (!SHA.test(c?.[f] ?? '')) err(at(f), 'must be a 40-hex commit sha');
    const f = c?.finding;
    if (typeof f?.path !== 'string' || !f.path || f.path.startsWith('-')) err(at('finding.path'), 'must be a non-empty path not starting with "-"');
    if (typeof f?.summary !== 'string' || !f.summary.trim()) err(at('finding.summary'), 'must be a non-empty string');
    if (typeof f?.pattern !== 'string' || !f.pattern) err(at('finding.pattern'), 'must be a non-empty regex source');
    else {
      try { new RegExp(f.pattern, 'i'); } catch { err(at('finding.pattern'), 'is not a valid regex'); }
    }
  });
  return errors;
}

// Pure: reviewer output → items of the "Bugs / regressions" and "Blocking issues" blocks of ### Review.
// A block starts at a `**Title**` line; an item at `- ` or `1. ` and runs over its continuation lines.
export function blockingItems(output) {
  const review = parseSections(output).find((s) => s.title === 'Review');
  if (!review) return [];
  const items = [];
  let inBlock = false;
  for (const line of review.body.split('\n')) {
    const title = line.match(/^\*\*(.+?)\*\*/)?.[1];
    if (title) { inBlock = BLOCKING_TITLES.some((re) => re.test(title)); continue; }
    if (!inBlock) continue;
    if (/^\s*(?:[-*]|\d+\.)\s+\S/.test(line)) items.push(line.trim());
    else if (items.length && line.trim()) items[items.length - 1] += ` ${line.trim()}`;
  }
  return items;
}

// Pure: the items that report the case's finding.
export function matchingItems(output, finding) {
  const re = new RegExp(finding.pattern, 'i');
  return blockingItems(output).filter((item) => item.includes(finding.path) && re.test(item));
}

// Pure: { pass, reasons[], matched[] }. An output that breaks the ADR-003 contract never passes.
export function gradeReview(output, evalCase, variant) {
  if (!VARIANTS.includes(variant)) throw new Error(`variant must be one of ${VARIANTS.join(', ')}`);
  const contract = checkAgentOutput(output, { allowed: REVIEWER_STATUSES });
  if (!contract.ok) return { pass: false, reasons: contract.violations.map((v) => `contract: ${v}`), matched: [] };
  const matched = matchingItems(output, evalCase.finding);
  const reasons = [];
  if (variant === 'defect') {
    if (contract.status !== 'NEEDS_REVIEW') reasons.push(`Status is ${contract.status}, expected NEEDS_REVIEW`);
    if (!matched.length) reasons.push(`no blocking item names ${evalCase.finding.path} and matches /${evalCase.finding.pattern}/i`);
  } else if (matched.length) {
    reasons.push(`the fixed state still reports the finding: ${matched[0].slice(0, 120)}`);
  }
  return { pass: reasons.length === 0, reasons, matched };
}
