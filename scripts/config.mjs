#!/usr/bin/env node
// Read configs/git.yaml — minimal key: value YAML parser (no external deps)
// Supports: comments, string values, null values. No nested keys or lists.

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GIT_CONFIG_PATH = join(REPO_ROOT, 'configs', 'git.yaml');

const DEFAULTS = {
  default_branch: 'main',
  remote: 'origin',
};

export function loadGitConfig(configPath = GIT_CONFIG_PATH) {
  if (!existsSync(configPath)) return { ...DEFAULTS };
  const raw = readFileSync(configPath, 'utf8');
  return { ...DEFAULTS, ...parseYaml(raw) };
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
