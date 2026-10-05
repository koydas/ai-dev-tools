#!/usr/bin/env node
// Normalize a PR fetched without `gh` (GitHub REST `pulls/{n}` JSON, or the GitHub MCP
// `pull_request_read` method `get`) to the field names gh-get-pr.mjs emits (ADR-010).
// The mapping itself is gh-get-pr.mjs's mapRestPr (ADR-011); this script adds the input checks the
// MCP path needs and the `repository` field. Fields the input does not carry (reviews, comments,
// and assignees / review requests when absent) are null — fetch them separately.
// Usage: node scripts/normalize-pr.mjs <file.json>     (or JSON on stdin)
// Node ≥ 20

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mapRestPr } from './gh-get-pr.mjs';

// Pure: REST / MCP PR object → gh-get-pr.mjs shape, plus `repository` (the base repository).
export function normalizePr(raw) {
  if (!raw || typeof raw !== 'object' || !Number.isInteger(raw.number)) {
    throw new Error('not a pull request object: missing integer "number"');
  }
  const headSha = raw.head?.sha;
  if (typeof headSha !== 'string' || !/^[0-9a-f]{40}$/i.test(headSha)) {
    throw new Error('pull request has no 40-char head.sha');
  }
  return { ...mapRestPr(raw), repository: raw.base?.repo?.full_name ?? null };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  try {
    const text = readFileSync(file ?? 0, 'utf8');
    console.log(JSON.stringify(normalizePr(JSON.parse(text)), null, 2));
  } catch (err) {
    console.error(`Error normalizing PR: ${err.message}\nUsage: node scripts/normalize-pr.mjs <file.json>`);
    process.exit(1);
  }
}
