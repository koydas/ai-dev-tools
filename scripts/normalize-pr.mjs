#!/usr/bin/env node
// Normalize a PR fetched without `gh` (GitHub REST `pulls/{n}` JSON, or the GitHub MCP
// `pull_request_read` method `get`) to the field names gh-get-pr.mjs emits (ADR-010).
// Usage: node scripts/normalize-pr.mjs <file.json>     (or JSON on stdin)
// Node ≥ 20

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pick = (obj, ...keys) => keys.map((k) => obj?.[k]).find((v) => v !== undefined) ?? null;

// Pure: REST / MCP PR object → gh-get-pr.mjs shape (subset the commands and agents use).
export function normalizePr(raw) {
  if (!raw || typeof raw !== 'object' || !Number.isInteger(raw.number)) {
    throw new Error('not a pull request object: missing integer "number"');
  }
  const headSha = raw.head?.sha;
  if (typeof headSha !== 'string' || !/^[0-9a-f]{40}$/i.test(headSha)) {
    throw new Error('pull request has no 40-char head.sha');
  }
  const headRepo = raw.head?.repo?.full_name ?? null;
  const baseRepo = raw.base?.repo?.full_name ?? null;
  const merged = raw.merged === true || Boolean(raw.merged_at);
  const state = merged ? 'MERGED' : String(raw.state ?? '').toUpperCase() || null;
  return {
    number: raw.number,
    title: raw.title ?? '',
    body: raw.body ?? '',
    state,
    author: { login: raw.user?.login ?? null },
    headRefName: raw.head?.ref ?? null,
    headRefOid: headSha,
    baseRefName: raw.base?.ref ?? null,
    // Unknown head repo (deleted fork) counts as cross-repository: the fork gate must ask.
    isCrossRepository: !headRepo || !baseRepo || headRepo.toLowerCase() !== baseRepo.toLowerCase(),
    labels: (raw.labels ?? []).map((l) => ({ name: typeof l === 'string' ? l : l?.name ?? null })),
    url: pick(raw, 'html_url', 'url'),
    isDraft: pick(raw, 'draft', 'isDraft') === true,
    createdAt: pick(raw, 'created_at', 'createdAt'),
    updatedAt: pick(raw, 'updated_at', 'updatedAt'),
    mergedAt: pick(raw, 'merged_at', 'mergedAt'),
    repository: baseRepo,
  };
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
