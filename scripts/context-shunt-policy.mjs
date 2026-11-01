// Context Shunt trust boundary and file eligibility (ADR-022). Node >= 20; no dependencies.
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const DEFAULTS = Object.freeze({ minLines: 350, maxBytes: 240000, maxFiles: 6 });
export const enabled = (env = process.env) =>
  env.AI_DEV_TOOLS_CONTEXT_SHUNT === '1' && Boolean(env.ANTHROPIC_API_KEY);

export function sensitivePath(path) {
  return path.split(/[\\/]/).some((part) =>
    /^(?:\.git|\.ssh|node_modules|\.env(?:\..*)?|\.npmrc|\.pypirc|secrets?|credentials?|id_rsa|id_ed25519)$/i.test(part)
    || /\.(?:pem|key|p12|pfx|kdbx)$/i.test(part));
}

export function loadSources(paths, { cwd = process.cwd(), maxBytes = DEFAULTS.maxBytes, maxFiles = DEFAULTS.maxFiles } = {}) {
  if (!Array.isArray(paths) || !paths.length || paths.length > maxFiles) throw new Error('Invalid file count');
  const root = realpathSync(cwd);
  const seen = new Set();
  let total = 0;
  return paths.map((path) => {
    if (typeof path !== 'string' || !path.trim() || path.startsWith('-')) throw new Error('Invalid file path');
    const abs = resolve(root, path);
    const rel = relative(root, abs);
    if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel) || sensitivePath(rel)) {
      throw new Error('Path outside trusted scope or sensitive path');
    }
    if (seen.has(rel)) throw new Error('Duplicate file');
    seen.add(rel);
    const stat = lstatSync(abs);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes || realpathSync(abs) !== abs) {
      throw new Error('Unsupported or oversized file');
    }
    total += stat.size;
    if (total > maxBytes) throw new Error('Total byte limit exceeded');
    const content = readFileSync(abs, 'utf8');
    if (content.includes('\0') || content.includes('\uFFFD')) throw new Error('Binary or non-UTF8 source');
    return { path: rel.split(sep).join('/'), lines: content.split(/\r?\n/) };
  });
}

export function shouldShunt(event, options = {}) {
  const env = options.env ?? process.env;
  if (!enabled(env) || event?.tool_name !== 'Read') return false;
  const input = event.tool_input ?? {};
  if (input.offset != null || input.limit != null || typeof input.file_path !== 'string') return false;
  try {
    const [source] = loadSources([input.file_path], { cwd: event.cwd ?? options.cwd ?? process.cwd() });
    const min = Number(env.AI_DEV_TOOLS_CONTEXT_SHUNT_MIN_LINES ?? DEFAULTS.minLines);
    return Number.isInteger(min) && min > 0 && source.lines.length > min;
  } catch {
    return false; // Never block a read if delegation is not safe and available.
  }
}
