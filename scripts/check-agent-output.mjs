#!/usr/bin/env node
// Check an agent's output against the ADR-003 contract → JSON verdict on stdout, exit 1 on a violation
// Usage: node scripts/check-agent-output.mjs [--agent <name>] [<file>]     (stdin when no file)
// --agent restricts Status to the values declared in agents/<name>.md (`[DONE | NEEDS_REVIEW]`).
// Contract: first `###` section is Status (`<VALUE> — summary`), last is Handoff, one or more
// agent-specific sections between; each section has content. Fenced code is ignored.
// Node ≥ 20, no external dependencies

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exitOnUnknownFlag } from './gh-transport.mjs';

const USAGE = 'Usage: node scripts/check-agent-output.mjs [--agent <name>] [<file>]';
const STATUSES = ['DONE', 'BLOCKED', 'NEEDS_REVIEW'];
const HALTING = ['BLOCKED', 'NEEDS_REVIEW'];
const AGENT_NAME = /^[a-z][a-z0-9-]*$/;
const AGENTS_DIR = new URL('../agents/', import.meta.url);

// Pure: output → [{ title, body }] for each level-3 heading outside a fenced block.
// Fences follow CommonMark: a block closes only on the same character, at least as many of them as the opener,
// and nothing after them (an info string means a nested opener, not a closer). A backtick opener whose info
// string holds a backtick is inline code, not a fence.
export function parseSections(text) {
  const sections = [];
  let fence = null;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (m && !fence) {
      if (!(m[1][0] === '`' && m[2].includes('`'))) fence = m[1];
    } else if (m && m[1][0] === fence[0] && m[1].length >= fence.length && !m[2].trim()) {
      fence = null;
    }
    const heading = !fence && !m ? line.match(/^### (\S.*?)\s*$/) : null;
    if (heading) sections.push({ title: heading[1], body: [] });
    else if (sections.length) sections.at(-1).body.push(line);
  }
  return sections.map((s) => ({ title: s.title, body: s.body.join('\n').trim() }));
}

// Pure: agent definition Markdown → the Status values its Output block declares, or null.
export function declaredStatuses(agentMarkdown) {
  const m = String(agentMarkdown ?? '').match(/^### Status\s*\n\[([A-Z_ |]+)\]/m);
  if (!m) return null;
  const values = m[1].split('|').map((v) => v.trim()).filter(Boolean);
  return values.length && values.every((v) => STATUSES.includes(v)) ? values : null;
}

// Pure: { ok, status, halts, violations[] }. `halts` is true for BLOCKED / NEEDS_REVIEW and for
// an unreadable status: a pipeline must not continue past output it cannot read.
export function checkAgentOutput(text, { allowed = STATUSES } = {}) {
  const violations = [];
  const sections = parseSections(text);
  const count = (title) => sections.filter((s) => s.title === title).length;

  if (!sections.length) violations.push('no "### " section found');
  if (sections.length && sections[0].title !== 'Status') violations.push('first section must be "### Status"');
  if (count('Status') > 1) violations.push('duplicate "### Status" section');
  if (!count('Handoff')) violations.push('missing "### Handoff" section');
  else if (sections.at(-1).title !== 'Handoff') violations.push('"### Handoff" must be the last section');
  if (count('Handoff') > 1) violations.push('duplicate "### Handoff" section');
  if (sections.length && !sections.some((s) => s.title !== 'Status' && s.title !== 'Handoff')) {
    violations.push('missing agent-specific section between Status and Handoff');
  }
  for (const s of sections) {
    if (!s.body) violations.push(`empty section "### ${s.title}"`);
  }

  let status = null;
  const statusSection = sections.find((s) => s.title === 'Status');
  if (statusSection?.body) {
    const line = statusSection.body.split('\n').find((l) => l.trim()) ?? '';
    const m = line.trim().match(/^([A-Z_]+)\s+[—–-]\s+(\S.*)$/);
    if (!m) violations.push('Status line must be "<VALUE> — <one-line summary>"');
    else if (!allowed.includes(m[1])) violations.push(`Status "${m[1]}" is not one of ${allowed.join(' | ')}`);
    else status = m[1];
  }

  return { ok: violations.length === 0, status, halts: status === null || HALTING.includes(status), violations };
}

function readAllowed(agent) {
  if (!AGENT_NAME.test(agent)) throw new Error(`invalid agent name "${agent}"`);
  const allowed = declaredStatuses(readFileSync(new URL(`${agent}.md`, AGENTS_DIR), 'utf8'));
  if (!allowed) throw new Error(`agents/${agent}.md declares no Status values`);
  return allowed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  exitOnUnknownFlag(args, { value: ['--agent'] }, USAGE);
  try {
    const i = args.indexOf('--agent');
    const agent = i === -1 ? null : args[i + 1];
    if (i !== -1 && !agent) throw new Error('--agent requires a name');
    const file = args.find((a, j) => !a.startsWith('-') && (i === -1 || j !== i + 1));
    const result = checkAgentOutput(readFileSync(file ?? 0, 'utf8'), agent ? { allowed: readAllowed(agent) } : {});
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(`Error: ${err.message}\n${USAGE}`);
    process.exit(1);
  }
}
