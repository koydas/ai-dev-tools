#!/usr/bin/env node
// Read configs/git.yaml, configs/paths.yaml, configs/meta-loop.yaml and configs/reviewers.yaml — minimal key: value YAML parser (no external deps)
// Supports: comments, string values, null values. No nested keys or lists.

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GIT_CONFIG_PATH = join(REPO_ROOT, 'configs', 'git.yaml');
const PATHS_CONFIG_PATH = join(REPO_ROOT, 'configs', 'paths.yaml');
const META_LOOP_CONFIG_PATH = join(REPO_ROOT, 'configs', 'meta-loop.yaml');
const REVIEWERS_CONFIG_PATH = join(REPO_ROOT, 'configs', 'reviewers.yaml');

const DEFAULTS = {
  default_branch: 'main',
  remote: 'origin',
};

export function loadGitConfig(configPath = GIT_CONFIG_PATH) {
  if (!existsSync(configPath)) return { ...DEFAULTS };
  const raw = readFileSync(configPath, 'utf8');
  return { ...DEFAULTS, ...parseYaml(raw) };
}

const PATHS_DEFAULTS = {
  reports_dir: '~/dev/pr-reviews',
};

export function loadPathsConfig(configPath = PATHS_CONFIG_PATH) {
  if (!existsSync(configPath)) return { ...PATHS_DEFAULTS };
  const parsed = parseYaml(readFileSync(configPath, 'utf8'));
  // A key present with an empty value falls back to its default.
  return Object.fromEntries(Object.entries({ ...PATHS_DEFAULTS, ...parsed }).map(([k, v]) => [k, v ?? PATHS_DEFAULTS[k] ?? null]));
}

const META_LOOP_DEFAULTS = {
  findings_url: 'https://koydas.github.io/autonomous-dev-loop/findings.json',
};

export function loadMetaLoopConfig(configPath = META_LOOP_CONFIG_PATH) {
  if (!existsSync(configPath)) return { ...META_LOOP_DEFAULTS };
  const parsed = parseYaml(readFileSync(configPath, 'utf8'));
  // A key present with an empty value falls back to its default.
  return Object.fromEntries(Object.entries({ ...META_LOOP_DEFAULTS, ...parsed }).map(([k, v]) => [k, v ?? META_LOOP_DEFAULTS[k] ?? null]));
}

// Pure: the `- login: x` / `  type: Bot` list of configs/reviewers.yaml → [{ login, type }].
// An entry without both keys is dropped (fail closed).
export function parseReviewers(content) {
  const entries = [];
  let current = null;
  for (const rawLine of String(content ?? '').split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    const m = line.match(/^\s*(-\s+)?(login|type):\s*(.+)$/);
    if (!m) continue;
    if (m[1]) entries.push((current = {}));
    if (current) current[m[2]] = m[3].trim();
  }
  return entries.filter((e) => e.login && e.type);
}

// A missing file is an empty allowlist: no reviewer is read.
export function loadReviewersConfig(configPath = REVIEWERS_CONFIG_PATH) {
  if (!existsSync(configPath)) return [];
  return parseReviewers(readFileSync(configPath, 'utf8'));
}

function parseYaml(content) {
  const result = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (match) {
      const val = match[2].trim();
      result[match[1]] = val || null;
    }
  }
  return result;
}
