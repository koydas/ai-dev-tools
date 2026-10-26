#!/usr/bin/env node
// Run the code-reviewer agent on the eval cases and grade each output → results JSON + summary
// Usage: node scripts/eval-run.mjs [--case <id>] [--variant defect|fixed|both] [--runs <1..10>] [--model <m>]
//          [--effort <level>] [--cases <file>] [--out <file>] [--raw-dir <dir>] [--timeout-min <n>]
//          [--max-budget-usd <n>] [--dry-run]
//        node scripts/eval-run.mjs --regrade <results.json> [--cases <file>] [--out <file>] [--raw-dir <dir>]   (re-grade saved outputs, no LLM call)
// Each run reviews an isolated repo holding only the history up to the reviewed commit (`head` for the defect
// variant, `fixed_head` for the fixed one), so the fix cannot be read from git. It calls `claude -p`: it costs
// money and is not deterministic — run it by hand, never in CI. Exit 1: bad input; 2: a run errored.
// Node ≥ 20, no external dependencies

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exitOnUnknownFlag } from './gh-transport.mjs';
import { gradeReview, validateCases } from './eval-grade.mjs';
import { checkAgentOutput } from './check-agent-output.mjs';

const USAGE = 'Usage: node scripts/eval-run.mjs [--case <id>] [--variant defect|fixed|both] [--runs <1..10>] [--model <m>] [--effort <level>] [--cases <file>] [--out <file>] [--raw-dir <dir>] [--timeout-min <n>] [--max-budget-usd <n>] [--dry-run] | --regrade <results.json> [--cases <file>] [--out <file>] [--raw-dir <dir>]';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VALUE_FLAGS = ['--case', '--variant', '--runs', '--model', '--effort', '--cases', '--out', '--raw-dir', '--timeout-min', '--max-budget-usd', '--regrade'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const TOOLS = 'Read,Grep,Glob,Bash';
// Pinned so a result is comparable: the eval measures the agent definition, not the CLI defaults.
const GIT_ENV = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'uploadpack.allowAnySHA1InWant', GIT_CONFIG_VALUE_0: 'true' };

// Pure: argv → validated options. Throws with the offending flag.
export function parseArgs(argv, today = new Date().toISOString().slice(0, 10)) {
  const v = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dry-run') v.dryRun = true;
    else if (VALUE_FLAGS.includes(argv[i])) {
      if (i + 1 >= argv.length) throw new Error(`${argv[i]} requires a value`);
      v[argv[i].slice(2)] = argv[(i += 1)];
    } else throw new Error(`unexpected argument ${argv[i]}`);
  }
  const int = (name, def, min, max) => {
    const n = v[name] === undefined ? def : Number(v[name]);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`--${name} must be an integer in ${min}..${max}`);
    return n;
  };
  const budget = v['max-budget-usd'] === undefined ? 3 : Number(v['max-budget-usd']);
  if (!(budget > 0 && budget <= 20)) throw new Error('--max-budget-usd must be in (0, 20]');
  const variant = v.variant ?? 'both';
  if (!['defect', 'fixed', 'both'].includes(variant)) throw new Error('--variant must be defect, fixed or both');
  if (v.case !== undefined && !/^[a-z0-9][a-z0-9-]*$/.test(v.case)) throw new Error('--case must be a case id');
  if (v.model !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v.model)) throw new Error('--model must be a model name');
  if (v.effort !== undefined && !EFFORTS.includes(v.effort)) throw new Error(`--effort must be one of ${EFFORTS.join(', ')}`);
  return {
    caseId: v.case ?? null, variants: variant === 'both' ? ['defect', 'fixed'] : [variant],
    runs: int('runs', 1, 1, 10), timeoutMin: int('timeout-min', 15, 1, 60), budget,
    regrade: v.regrade ?? null, model: v.model ?? null, effort: v.effort ?? null, dryRun: Boolean(v.dryRun),
    casesFile: v.cases ?? join(ROOT, 'evals/code-reviewer/cases.json'),
    out: v.out ?? join(ROOT, `evals/results/${today}-code-reviewer.json`),
    rawDir: v['raw-dir'] ?? join(ROOT, `evals/results/raw/${today}`),
  };
}

// Pure: the agent definition without its YAML frontmatter.
export function stripFrontmatter(markdown) {
  return String(markdown).replace(/^---\n[\s\S]*?\n---\n/, '').trim();
}

// Pure: the task given to the agent. Same inputs the /pr-review command passes: diff location, AC, no base CI.
export function buildPrompt(evalCase) {
  return [
    'Review the change on this checkout against its acceptance criteria.',
    `Base commit: ${evalCase.base}. The change is committed: review \`git diff ${evalCase.base} HEAD\`; the working tree is clean.`,
    'Acceptance criteria:',
    ...evalCase.ac.map((a) => `- ${a}`),
    'No base CI results are available. There is no network access.',
    'Answer with the `### Status` / `### Review` / `### Handoff` block only.',
  ].join('\n');
}

// Pure: the `claude` argv. No Write/Edit tool; Bash is unrestricted like in /pr-review (the agent runs the repo's checks:
// compound commands, `node --test | tail`, loops — a per-command allowlist denied them and weakened the review). The
// checkout is a disposable repo of old history; this is not a sandbox: do not run the eval on untrusted cases.
export function buildClaudeArgs({ prompt, systemPrompt, model, effort, budget }) {
  return [
    '-p', prompt, '--output-format', 'json', '--no-session-persistence', '--setting-sources', 'project',
    '--permission-mode', 'bypassPermissions', '--tools', TOOLS,
    '--append-system-prompt', systemPrompt, '--max-budget-usd', String(budget),
    ...(model ? ['--model', model] : []), ...(effort ? ['--effort', effort] : []),
  ];
}

// Pure: model text → the contract block (drops any prose before `### Status`), or the text unchanged.
export function extractReview(text) {
  const s = String(text ?? '');
  const i = s.search(/^### Status\s*$/m);
  return i === -1 ? s.trim() : s.slice(i).trim();
}

// Pure: `claude --output-format json` stdout → { text, costUsd, durationMs, models, isError, denials }.
// `denials` = tool calls the permission mode refused ("Bash: <command>"): a run with any is a weaker review.
export function parseClaudeResult(stdout) {
  const j = JSON.parse(stdout);
  return {
    text: typeof j.result === 'string' ? j.result : '', isError: Boolean(j.is_error) || j.subtype?.startsWith('error') === true,
    costUsd: Number(j.total_cost_usd) || 0, durationMs: Number(j.duration_ms) || 0, models: Object.keys(j.modelUsage ?? {}),
    denials: (Array.isArray(j.permission_denials) ? j.permission_denials : []).map((d) => `${d?.tool_name ?? '?'}: ${String(d?.tool_input?.command ?? d?.tool_input?.file_path ?? '').slice(0, 120)}`),
  };
}

// Pure: results → { defect: { runs, passed, errored, denied, rate }, fixed: …, cost_usd }. Errored runs leave the rate.
export function summarize(results) {
  const out = { cost_usd: 0 };
  for (const variant of ['defect', 'fixed']) {
    const rs = results.filter((r) => r.variant === variant);
    if (!rs.length) continue;
    const errored = rs.filter((r) => r.error).length;
    const passed = rs.filter((r) => r.pass).length;
    const graded = rs.length - errored;
    out[variant] = { runs: rs.length, passed, errored, denied: rs.filter((r) => r.denials?.length).length, rate: graded ? Number((passed / graded).toFixed(3)) : null };
  }
  out.cost_usd = Number(results.reduce((n, r) => n + (r.cost_usd || 0), 0).toFixed(4));
  return out;
}

const run = (cmd, args, options) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });

// Isolated repo: `sha` and its ancestors only, checked out detached. Nothing newer is reachable.
export function prepareCheckout(sha, dir, exec = run, source = ROOT) {
  const step = (args, env) => {
    const r = exec('git', args, { cwd: dir, env: { ...process.env, ...env } });
    if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${String(r.stderr).split('\n')[0]}`);
  };
  step(['init', '-q']);
  step(['fetch', '-q', '--no-tags', source, sha], GIT_ENV);
  step(['checkout', '-q', '--detach', sha]);
}

// One run of one case → a result record. Never throws: a failure is recorded in `error`.
export function runOnce(evalCase, variant, opts, systemPrompt, exec = run) {
  const record = { id: evalCase.id, variant, pass: false, reasons: [], status: null };
  const dir = mkdtempSync(join(tmpdir(), 'eval-'));
  try {
    prepareCheckout(variant === 'defect' ? evalCase.head : evalCase.fixed_head, dir, exec);
    const r = exec('claude', buildClaudeArgs({ prompt: buildPrompt(evalCase), systemPrompt, ...opts }), { cwd: dir, timeout: opts.timeoutMin * 60_000 });
    if (r.error || r.status !== 0) throw new Error(r.error?.code === 'ETIMEDOUT' ? `timeout after ${opts.timeoutMin} min` : `claude exited ${r.status}: ${String(r.stderr).split('\n')[0]}`);
    const res = parseClaudeResult(r.stdout);
    Object.assign(record, { cost_usd: res.costUsd, duration_ms: res.durationMs, models: res.models });
    if (res.denials.length) record.denials = res.denials;
    if (res.isError) throw new Error('claude reported an error result');
    const review = extractReview(res.text);
    record.raw = review;
    record.status = checkAgentOutput(review, { allowed: ['DONE', 'NEEDS_REVIEW'] }).status;
    Object.assign(record, gradeReview(review, evalCase, variant));
  } catch (err) {
    record.error = err.message;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return record;
}

// Pure (readRaw injected): re-grade saved results against the current cases. Errored runs stay as they were.
// The n-th result of an (id, variant) is run n, matching the raw file names.
export function regradeResults(results, cases, readRaw) {
  const seen = {};
  return results.map((r) => {
    const key = `${r.id}/${r.variant}`;
    seen[key] = (seen[key] ?? 0) + 1;
    if (r.error) return r;
    const evalCase = cases.find((c) => c.id === r.id);
    if (!evalCase) throw new Error(`no case "${r.id}" for a saved result`);
    const review = readRaw(r.id, r.variant, seen[key]);
    const { pass, reasons, matched } = gradeReview(review, evalCase, r.variant);
    return { ...r, pass, reasons, matched, status: checkAgentOutput(review, { allowed: ['DONE', 'NEEDS_REVIEW'] }).status };
  });
}

export function selectCases(cases, caseId) {
  const picked = caseId ? cases.filter((c) => c.id === caseId) : cases;
  if (!picked.length) throw new Error(`no case "${caseId}"`);
  return picked;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  exitOnUnknownFlag(args, { value: VALUE_FLAGS, bool: ['--dry-run'] }, USAGE);
  let opts;
  let cases;
  try {
    opts = parseArgs(args);
    const doc = JSON.parse(readFileSync(opts.casesFile, 'utf8'));
    const errors = validateCases(doc);
    if (errors.length) throw new Error(`invalid cases file:\n${errors.join('\n')}`);
    cases = selectCases(doc.cases, opts.caseId);
  } catch (err) {
    console.error(`Error: ${err.message}\n${USAGE}`);
    process.exit(1);
  }
  if (opts.regrade) {
    try {
      const saved = JSON.parse(readFileSync(opts.regrade, 'utf8'));
      const results = regradeResults(saved.results, cases, (id, variant, n) => readFileSync(join(opts.rawDir, `${id}-${variant}-${n}.md`), 'utf8'));
      writeFileSync(opts.out, `${JSON.stringify({ ...saved, regraded: new Date().toISOString(), summary: summarize(results), results }, null, 2)}\n`);
      console.log(JSON.stringify(summarize(results), null, 2));
      process.exit(0);
    } catch (err) {
      console.error(`Error: ${err.message}\n${USAGE}`);
      process.exit(1);
    }
  }
  const total = cases.length * opts.variants.length * opts.runs;
  if (opts.dryRun) {
    console.log(`${total} run(s): ${cases.length} case(s) × ${opts.variants.join('+')} × ${opts.runs}; budget cap ${opts.budget} USD each (max ${(total * opts.budget).toFixed(0)} USD)`);
    process.exit(0);
  }
  const systemPrompt = stripFrontmatter(readFileSync(join(ROOT, 'agents/code-reviewer.md'), 'utf8'));
  mkdirSync(opts.rawDir, { recursive: true });
  const results = [];
  for (const c of cases) {
    for (const variant of opts.variants) {
      for (let n = 1; n <= opts.runs; n += 1) {
        const r = runOnce(c, variant, opts, systemPrompt);
        if (r.raw) writeFileSync(join(opts.rawDir, `${c.id}-${variant}-${n}.md`), `${r.raw}\n`);
        delete r.raw;
        results.push(r);
        console.error(`${r.error ? 'ERROR' : r.pass ? 'PASS ' : 'FAIL '} ${c.id} ${variant} #${n}${r.error ? ` — ${r.error}` : r.pass ? '' : ` — ${r.reasons[0]}`}`);
      }
    }
  }
  const summary = summarize(results);
  const models = [...new Set(results.flatMap((r) => r.models ?? []))];
  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, `${JSON.stringify({ schema_version: 1, generated: new Date().toISOString(), agent: 'code-reviewer', models, runs_per_case: opts.runs, effort: opts.effort, summary, results }, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(results.some((r) => r.error) ? 2 : 0);
}
