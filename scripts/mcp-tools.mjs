#!/usr/bin/env node
// MCP tool registry (ADR-016): the gh-* scripts as typed tools. Each tool is a script, a pure
// `args(input)` that validates the input and builds the script's argv, and optionally the text
// the script reads from stdin. Library only — no CLI. Node ≥ 20.

const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const SHA = /^[0-9a-f]{7,40}$/i;
const REPO_PROP = { type: 'string', pattern: REPO.source, description: 'owner/repo; defaults to the server working directory\'s origin' };

// Each helper returns the validated value or throws; nothing user-controlled may start with `-`
// (it would be read as a flag by the script).
const positiveInt = (name, v) => {
  if (!Number.isInteger(v) || v < 1) throw new Error(`${name} must be a positive integer`);
  return String(v);
};
const noFlag = (name, v) => {
  if (typeof v !== 'string' || !v.trim() || v.startsWith('-')) throw new Error(`${name} must be a non-empty string not starting with "-"`);
  return v;
};
const oneOf = (name, v, values) => {
  if (!values.includes(v)) throw new Error(`${name} must be one of ${values.join(', ')}`);
  return v;
};
const repoArgs = (v) => {
  if (v === undefined) return [];
  if (typeof v !== 'string' || !REPO.test(v)) throw new Error('repo must be owner/repo');
  return ['--repo', v];
};

const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: true };

export const TOOLS = [
  {
    name: 'get_issue',
    script: 'gh-get-issue.mjs',
    description: 'Fetch a GitHub issue by number → JSON (title, body, labels, comments). GraphQL, else REST.',
    inputSchema: { type: 'object', properties: { number: { type: 'integer', minimum: 1 }, repo: REPO_PROP }, required: ['number'], additionalProperties: false },
    annotations: { title: 'Get issue', ...READ },
    args: (i) => [positiveInt('number', i.number), ...repoArgs(i.repo)],
  },
  {
    name: 'get_pr',
    script: 'gh-get-pr.mjs',
    description: 'Fetch a PR by reference (42, #42, owner/repo#42, URL) or by head branch → JSON with headRefOid, isCrossRepository and `repository`. One of ref / branch is required.',
    inputSchema: { type: 'object', properties: { ref: { type: 'string' }, branch: { type: 'string' }, repo: REPO_PROP }, additionalProperties: false },
    annotations: { title: 'Get pull request', ...READ },
    args: (i) => {
      if ((i.ref === undefined) === (i.branch === undefined)) throw new Error('exactly one of ref or branch is required');
      const target = i.ref !== undefined ? [noFlag('ref', i.ref)] : ['--branch', noFlag('branch', i.branch)];
      return [...target, ...repoArgs(i.repo)];
    },
  },
  {
    name: 'get_pr_threads',
    script: 'gh-get-pr-threads.mjs',
    description: 'Fetch the reviewer comment threads of a PR → JSON. `resolved: null` means the resolution state is unknown.',
    inputSchema: { type: 'object', properties: { number: { type: 'integer', minimum: 1 }, repo: REPO_PROP }, required: ['number'], additionalProperties: false },
    annotations: { title: 'Get PR review threads', ...READ },
    args: (i) => [positiveInt('number', i.number), ...repoArgs(i.repo)],
  },
  {
    name: 'get_pr_feedback',
    script: 'gh-get-pr-feedback.mjs',
    description: 'PR feedback for a fixer: latest review report, comments, reviews and unresolved threads of trusted humans; bots and outsiders are counted, never applied (ADR-014).',
    inputSchema: { type: 'object', properties: { number: { type: 'integer', minimum: 1 }, repo: REPO_PROP }, required: ['number'], additionalProperties: false },
    annotations: { title: 'Get PR feedback', ...READ },
    args: (i) => [positiveInt('number', i.number), ...repoArgs(i.repo)],
  },
  {
    name: 'get_check_runs',
    script: 'gh-get-check-runs.mjs',
    description: 'Fetch the CI check runs of a commit SHA → JSON.',
    inputSchema: { type: 'object', properties: { sha: { type: 'string', pattern: SHA.source }, repo: REPO_PROP }, required: ['sha'], additionalProperties: false },
    annotations: { title: 'Get check runs', ...READ },
    args: (i) => {
      if (typeof i.sha !== 'string' || !SHA.test(i.sha)) throw new Error('sha must be 7–40 hex characters');
      return [i.sha, ...repoArgs(i.repo)];
    },
  },
  {
    name: 'my_issues',
    script: 'gh-my-issues.mjs',
    description: 'List the issues assigned to the authenticated GitHub user.',
    inputSchema: { type: 'object', properties: { repo: REPO_PROP, state: { enum: ['open', 'closed', 'all'] }, limit: { type: 'integer', minimum: 1, maximum: 200 } }, additionalProperties: false },
    annotations: { title: 'My issues', ...READ },
    args: (i) => [
      ...repoArgs(i.repo),
      ...(i.state === undefined ? [] : ['--state', oneOf('state', i.state, ['open', 'closed', 'all'])]),
      ...(i.limit === undefined ? [] : ['--limit', positiveInt('limit', i.limit)]),
    ],
  },
  {
    name: 'normalize_pr',
    script: 'normalize-pr.mjs',
    description: 'Map a PR object fetched through GitHub REST / the GitHub MCP server (`pull_request_read` get) to the get_pr field names (ADR-010). Pure, no network.',
    inputSchema: { type: 'object', properties: { pr: { type: 'object', description: 'The raw pull request object' } }, required: ['pr'], additionalProperties: false },
    annotations: { title: 'Normalize PR', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    args: () => [],
    stdin: (i) => {
      if (!i.pr || typeof i.pr !== 'object' || Array.isArray(i.pr)) throw new Error('pr must be an object');
      return JSON.stringify(i.pr);
    },
  },
  {
    name: 'post_comment',
    script: 'gh-post-comment.mjs',
    description: 'Post a comment on a GitHub issue or PR. Writes to GitHub: the server asks the user to confirm (MCP elicitation) when the client supports it. The body is a plain comment, never a review verdict.',
    inputSchema: { type: 'object', properties: { number: { type: 'integer', minimum: 1 }, body: { type: 'string', minLength: 1 }, repo: REPO_PROP }, required: ['number', 'body'], additionalProperties: false },
    annotations: { title: 'Post comment', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    write: true,
    args: (i) => [positiveInt('number', i.number), ...repoArgs(i.repo)],
    stdin: (i) => {
      if (typeof i.body !== 'string' || !i.body.trim()) throw new Error('body must be a non-empty string');
      return i.body;
    },
  },
];

export const findTool = (name) => TOOLS.find((t) => t.name === name);

// Pure: validated invocation of a tool → { script, args, stdin }. Throws on invalid input.
export function buildInvocation(tool, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('arguments must be an object');
  const allowed = Object.keys(tool.inputSchema.properties);
  const unknown = Object.keys(input).filter((k) => !allowed.includes(k));
  if (unknown.length) throw new Error(`unknown argument: ${unknown.join(', ')}`);
  const missing = (tool.inputSchema.required ?? []).filter((k) => input[k] === undefined);
  if (missing.length) throw new Error(`missing argument: ${missing.join(', ')}`);
  return { script: tool.script, args: tool.args(input), stdin: tool.stdin ? tool.stdin(input) : undefined };
}
