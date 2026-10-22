#!/usr/bin/env node
// Aggregate Claude Code token usage from JSONL session files
// Usage: node scripts/token-audit.mjs [--days <n>] [--src <path>] [--include-cache] [--json]
// Totals, model/day breakdowns and the session ranking count input + output tokens; --include-cache adds cache read/write.
// Node ≥ 20, no external dependencies

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const DEFAULT_DAYS = 30;
const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

export function auditTokens({ days = DEFAULT_DAYS, src = PROJECTS_DIR, includeCache = false } = {}) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const sessions = collectSessions(src, cutoff);

  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const byModel = {};
  const byDay = {};
  const topSessions = [];

  for (const session of sessions) {
    let sessionTokens = 0;
    for (const entry of session.entries) {
      // File mtime guards at the session level, but a recently touched file can
      // contain older entries — filter those out when a per-entry timestamp exists.
      if (entry.timestamp && new Date(entry.timestamp).getTime() < cutoff) continue;

      const usage = entry?.message?.usage ?? entry?.usage ?? null;
      if (!usage) continue;

      const input = usage.input_tokens ?? 0;
      const output = usage.output_tokens ?? 0;
      const cacheRead = usage.cache_read_input_tokens ?? 0;
      const cacheWrite = usage.cache_creation_input_tokens ?? 0;
      const model = entry?.message?.model ?? entry?.model ?? 'unknown';

      const counted = input + output + (includeCache ? cacheRead + cacheWrite : 0);

      totals.input += input;
      totals.output += output;
      totals.cacheRead += cacheRead;
      totals.cacheWrite += cacheWrite;
      sessionTokens += counted;

      byModel[model] = byModel[model] ?? { input: 0, output: 0, total: 0 };
      byModel[model].input += input;
      byModel[model].output += output;
      byModel[model].total += counted;

      const day = new Date(entry.timestamp ?? session.mtime).toISOString().slice(0, 10);
      byDay[day] = (byDay[day] ?? 0) + counted;
    }
    if (sessionTokens > 0) {
      topSessions.push({ project: session.project, file: session.file, tokens: sessionTokens, date: session.date });
    }
  }

  topSessions.sort((a, b) => b.tokens - a.tokens);

  return { days, ...(includeCache && { includeCache }), totals, byModel, byDay, topSessions: topSessions.slice(0, 10) };
}

function collectSessions(projectsDir, cutoff) {
  if (!existsSync(projectsDir)) return [];
  const sessions = [];

  for (const project of readdirSync(projectsDir)) {
    const projectPath = join(projectsDir, project);
    if (!statSync(projectPath).isDirectory()) continue;

    for (const file of readdirSync(projectPath)) {
      if (!file.endsWith('.jsonl')) continue;
      const filePath = join(projectPath, file);
      const stat = statSync(filePath);
      if (stat.mtimeMs < cutoff) continue;

      const entries = [];
      for (const line of readFileSync(filePath, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try { entries.push(JSON.parse(line)); } catch { /* skip malformed lines */ }
      }
      sessions.push({ project, file, entries, mtime: stat.mtime.toISOString(), date: stat.mtime.toISOString().slice(0, 10) });
    }
  }

  return sessions;
}

function formatReport(result) {
  const { days, totals, byModel, topSessions, includeCache } = result;
  const total = totals.input + totals.output + (includeCache ? totals.cacheRead + totals.cacheWrite : 0);
  const avgPerDay = days > 0 ? Math.round(total / days) : 0;

  console.log(`Token audit — last ${days} days\n`);
  console.log(`Total tokens ${includeCache ? '(incl. cache)' : '(excl. cache)'}: ${fmt(total)}`);
  console.log(`  Input:         ${fmt(totals.input)}`);
  console.log(`  Output:        ${fmt(totals.output)}`);
  console.log(`  Cache read:    ${fmt(totals.cacheRead)}`);
  console.log(`  Cache write:   ${fmt(totals.cacheWrite)}`);
  console.log(`\nDaily average: ${fmt(avgPerDay)} tokens/day`);

  if (Object.keys(byModel).length > 0) {
    console.log('\nModel breakdown:');
    for (const [model, stats] of Object.entries(byModel).sort((a, b) => b[1].total - a[1].total)) {
      const pct = total > 0 ? Math.round((stats.total / total) * 100) : 0;
      console.log(`  ${model.padEnd(30)} ${String(pct + '%').padStart(4)}   ${fmt(stats.total)}`);
    }
  }

  if (topSessions.length > 0) {
    console.log(`\nTop sessions by token usage ${includeCache ? '(incl. cache)' : '(excl. cache)'}:`);
    for (const s of topSessions) {
      console.log(`  ${s.date}  ${s.project.slice(0, 20).padEnd(20)}  ${fmt(s.tokens)} tokens`);
    }
  }
}

function fmt(n) {
  return n.toLocaleString('en-US');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const daysIdx = args.indexOf('--days');
  const srcIdx = args.indexOf('--src');

  const options = {
    days: daysIdx !== -1 ? parseInt(args[daysIdx + 1], 10) : DEFAULT_DAYS,
    src: srcIdx !== -1 ? args[srcIdx + 1] : PROJECTS_DIR,
    includeCache: args.includes('--include-cache'),
  };

  const result = auditTokens(options);

  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    formatReport(result);
  }
}
