#!/usr/bin/env node
// CLI for explicit, locally run A/B benchmarks. No remote calls without --live and two env opt-ins.
// ADR-024: JSON outputs contain only metrics, case ids and hashes, never source or questions.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadSources } from './context-shunt-policy.mjs';
import { runPaired } from './context-shunt-benchmark-core.mjs';

const DEFAULT_CASES = new URL('../benchmarks/context-shunt/cases.json', import.meta.url);

export function argsOf(argv) {
  const options = { live: false, repeats: 1, model: 'claude-sonnet-5-5',
    casesFile: fileURLToPath(DEFAULT_CASES) };
  const flags = { '--cases': 'casesFile', '--pricing': 'pricingFile', '--model': 'model',
    '--repeats': 'repeats', '--output': 'outputFile' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--live') options.live = true;
    else if (flags[argv[i]]) {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw Error('Missing value');
      options[flags[argv[i]]] = argv[++i];
    } else throw Error('Unknown argument');
  }
  options.repeats = Number(options.repeats);
  if (!Number.isInteger(options.repeats) || options.repeats < 1 || options.repeats > 3) throw Error('Repeats must be 1–3');
  if (!/^claude-[a-z0-9-]{3,70}$/.test(options.model)) throw Error('Invalid primary model');
  return options;
}

export function loadCases(path, cwd = process.cwd()) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(raw.cases) || !raw.cases.length || raw.cases.length > 6) throw Error('Cases must contain 1–6 entries');
  const ids = new Set();
  for (const item of raw.cases) {
    if (!/^[a-z][a-z0-9-]{1,55}$/.test(item.id) || ids.has(item.id)) throw Error('Duplicate or invalid case id');
    ids.add(item.id);
    if (typeof item.question !== 'string' || !item.question.trim() || item.question.length > 1500 ||
        !Array.isArray(item.must_include) || !item.must_include.length || item.must_include.length > 6 ||
        !item.must_include.every((s) => typeof s === 'string' && s.trim().length && s.length <= 80)) {
      throw Error('Invalid question or required phrases');
    }
    loadSources(item.paths, { cwd }); // Reject unsafe inputs before any provider requests.
  }
  return raw.cases;
}

export function gitRevision(cwd) {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}

export async function main(argv, { cwd = process.cwd(), env = process.env } = {}) {
  const opts = argsOf(argv);
  const cases = loadCases(opts.casesFile, cwd);
  const calls = cases.length * opts.repeats * 3; // Direct primary + shunt worker + shunt primary.
  if (!opts.live) return { live: false, case_count: cases.length,
    repeats: opts.repeats, expected_api_calls: calls, primary_model: opts.model,
    pricing_supplied: Boolean(opts.pricingFile), message: 'Plan only: add --live and explicit opt-in to call the API.' };
  if (env.AI_DEV_TOOLS_CONTEXT_SHUNT !== '1' || !env.ANTHROPIC_API_KEY) {
    throw Error('Live mode requires AI_DEV_TOOLS_CONTEXT_SHUNT=1 and ANTHROPIC_API_KEY');
  }
  if (opts.outputFile && existsSync(opts.outputFile)) throw Error('Output file exists; refusing overwrite');
  const prices = opts.pricingFile ? JSON.parse(readFileSync(opts.pricingFile, 'utf8')) : null;
  const benchmark = await runPaired({ cases, cwd, env, model: opts.model, prices,
    repeats: opts.repeats });
  const result = { ...benchmark, timestamp: new Date().toISOString(), revision: gitRevision(cwd),
    limitations: ['Must-include phrase scoring is a proxy, not semantic accuracy',
      'Prices unprovided or usage incomplete are null, not zero',
      'Standalone Anthropic API tests do not measure Claude Code session context growth',
      'Serial paired calls are sensitive to caching and temporal provider load'] };
  if (opts.outputFile) writeFileSync(opts.outputFile, JSON.stringify(result, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 });
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(JSON.stringify(await main(process.argv.slice(2)), null, 2) + '\n'); }
  catch (error) {
    process.stderr.write('Benchmark failed (' + (error.name || 'Error') + '). Check inputs and opt-in; no case content printed.\n');
    process.exitCode = 1;
  }
}
