#!/usr/bin/env node
// MCP server (stdio, newline-delimited JSON-RPC 2.0, zero dependency) — ADR-016.
//   tools      the read-only gh-* scripts + post_comment (scripts/mcp-tools.mjs)
//   prompts    commands/*.md, `$ARGUMENTS` and `${CLAUDE_PLUGIN_ROOT}` substituted
//   resources  agents/*.md (`ai-dev-tools://agents/<name>`), for the prompts that name a subagent
// Tools run the sibling scripts as child processes; the server holds no logic of its own.
// Usage: node scripts/mcp-server.mjs        (a client launches it; logs go to stderr)
// Node ≥ 20

import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { TOOLS, findTool, buildInvocation } from './mcp-tools.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const PLUGIN_ROOT_TOKEN = '${CLAUDE_PLUGIN_ROOT}';
const AGENT_URI = 'ai-dev-tools://agents/';
const RUN_TIMEOUT_MS = 120_000;
const MAX_OUTPUT = 32 * 1024 * 1024;
// Local-machine administration of a Claude Code install: meaningless as a prompt elsewhere.
const EXCLUDED_COMMANDS = new Set(['sync-ai-dev-tools']);

const PROMPT_PREAMBLE = [
  'This prompt is a Claude Code command of ai-dev-tools. Where it names a subagent, read the',
  `resource \`${AGENT_URI}<name>\` and follow it as that agent's instructions; where it runs a`,
  'script, the equivalent MCP tool is available when this server lists one.',
].join(' ');

const JSONRPC = { parse: -32700, request: -32600, method: -32601, params: -32602, internal: -32603 };

// Pure: `---` frontmatter of a command / agent → { meta, body }. Only flat `key: value` lines.
export function parseFrontmatter(text) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: String(text) };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return { meta, body: m[2] };
}

const fillRoot = (text, root) => text.replaceAll(PLUGIN_ROOT_TOKEN, root.replaceAll('\\', '/'));

const listMarkdown = (dir) =>
  readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort();

// Commands → MCP prompts (reads the repo's own files).
export function listPrompts(root = ROOT) {
  return listMarkdown(join(root, 'commands'))
    .filter((name) => !EXCLUDED_COMMANDS.has(name))
    .map((name) => {
      const { meta } = parseFrontmatter(readFileSync(join(root, 'commands', `${name}.md`), 'utf8'));
      return {
        name,
        description: meta.description ?? name,
        arguments: [{ name: 'arguments', description: meta['argument-hint'] ?? 'Arguments of the command', required: false }],
      };
    });
}

export function getPrompt(name, args = {}, root = ROOT) {
  if (!listPrompts(root).some((p) => p.name === name)) throw Object.assign(new Error(`unknown prompt: ${name}`), { code: JSONRPC.params });
  const { meta, body } = parseFrontmatter(readFileSync(join(root, 'commands', `${name}.md`), 'utf8'));
  const text = fillRoot(body, root).replaceAll('$ARGUMENTS', String(args?.arguments ?? ''));
  return {
    description: meta.description ?? name,
    messages: [{ role: 'user', content: { type: 'text', text: `${PROMPT_PREAMBLE}\n\n${text}` } }],
  };
}

export function listResources(root = ROOT) {
  return listMarkdown(join(root, 'agents')).map((name) => {
    const { meta } = parseFrontmatter(readFileSync(join(root, 'agents', `${name}.md`), 'utf8'));
    return { uri: `${AGENT_URI}${name}`, name, description: meta.description ?? name, mimeType: 'text/markdown' };
  });
}

export function readResource(uri, root = ROOT) {
  const resource = listResources(root).find((r) => r.uri === uri);
  if (!resource) throw Object.assign(new Error(`unknown resource: ${uri}`), { code: -32002 });
  const text = fillRoot(readFileSync(join(root, 'agents', `${resource.name}.md`), 'utf8'), root);
  return { contents: [{ uri, mimeType: 'text/markdown', text }] };
}

// Runs `node scripts/<script> ...args`; never through a shell. → { code, stdout, stderr }
export function runScript({ script, args, stdin }, root = ROOT) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(root, 'scripts', script), ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), RUN_TIMEOUT_MS);
    child.stdout.on('data', (d) => { if (stdout.length < MAX_OUTPUT) stdout += d; });
    child.stderr.on('data', (d) => { if (stderr.length < MAX_OUTPUT) stderr += d; });
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: 1, stdout, stderr: err.message }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }); });
    child.stdin.on('error', () => {});
    child.stdin.end(stdin ?? '');
  });
}

const toolResult = (text, isError = false) => ({ content: [{ type: 'text', text }], isError });

const version = () => JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;

// The server state: client capabilities, and the requests it sent and awaits an answer for.
// `send` writes one JSON-RPC message; `run` executes a script (injectable for tests).
export function createServer({ send, run = runScript, root = ROOT, serverVersion = version() } = {}) {
  let clientCapabilities = {};
  let nextRequestId = 1;
  const pending = new Map();

  const ask = (method, params) => new Promise((resolve) => {
    const id = `srv-${nextRequestId++}`;
    pending.set(id, resolve);
    send({ jsonrpc: '2.0', id, method, params });
  });

  // post_comment publishes on GitHub: confirm with the user when the client can ask them.
  async function confirmWrite(input) {
    if (!clientCapabilities.elicitation) return true;
    const reply = await ask('elicitation/create', {
      message: `Post this comment on ${input.repo ?? 'the current repository'}#${input.number}?\n\n${input.body}`,
      requestedSchema: { type: 'object', properties: { confirm: { type: 'boolean', title: 'Post the comment' } }, required: ['confirm'] },
    });
    return reply?.result?.action === 'accept' && reply.result.content?.confirm === true;
  }

  async function callTool(params) {
    const tool = findTool(params?.name);
    if (!tool) throw Object.assign(new Error(`unknown tool: ${params?.name}`), { code: JSONRPC.params });
    let invocation;
    try {
      invocation = buildInvocation(tool, params.arguments ?? {});
    } catch (err) {
      return toolResult(`Invalid arguments: ${err.message}`, true);
    }
    if (tool.write && !(await confirmWrite(params.arguments))) return toolResult('Not posted: the user declined or dismissed the confirmation.', true);
    const { code, stdout, stderr } = await run(invocation, root);
    return code === 0 ? toolResult(stdout.trim()) : toolResult((stderr || stdout || `${tool.script} exited ${code}`).trim(), true);
  }

  const handlers = {
    initialize: (params) => {
      clientCapabilities = params?.capabilities ?? {};
      const requested = params?.protocolVersion;
      return {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: {}, prompts: {}, resources: {} },
        serverInfo: { name: 'ai-dev-tools', title: 'ai-dev-tools', version: serverVersion },
        instructions: 'Human-gated SDLC toolbox: GitHub read tools, one gated write (post_comment), the toolbox commands as prompts and its agents as resources.',
      };
    },
    ping: () => ({}),
    'tools/list': () => ({
      tools: TOOLS.map(({ name, annotations, description, inputSchema }) => ({ name, title: annotations.title, description, inputSchema, annotations })),
    }),
    'tools/call': callTool,
    'prompts/list': () => ({ prompts: listPrompts(root) }),
    'prompts/get': (params) => getPrompt(params?.name, params?.arguments, root),
    'resources/list': () => ({ resources: listResources(root) }),
    'resources/read': (params) => readResource(params?.uri, root),
  };

  // One incoming message (already parsed). Notifications get no reply; responses settle `ask`.
  async function handle(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0') {
      return send({ jsonrpc: '2.0', id: message?.id ?? null, error: { code: JSONRPC.request, message: 'Invalid Request' } });
    }
    if (message.method === undefined) {
      const settle = pending.get(message.id);
      pending.delete(message.id);
      return settle?.(message);
    }
    if (message.id === undefined) return; // notification: initialized, cancelled, …
    const handler = handlers[message.method];
    if (!handler) return send({ jsonrpc: '2.0', id: message.id, error: { code: JSONRPC.method, message: `Method not found: ${message.method}` } });
    try {
      send({ jsonrpc: '2.0', id: message.id, result: await handler(message.params) });
    } catch (err) {
      send({ jsonrpc: '2.0', id: message.id, error: { code: err.code ?? JSONRPC.internal, message: err.message } });
    }
  }
  // The client is gone: a confirmation nobody will answer counts as declined.
  handle.abort = () => {
    for (const settle of pending.values()) settle(null);
    pending.clear();
  };
  return handle;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
  const handle = createServer({ send });
  const lines = createInterface({ input: process.stdin });
  const inflight = new Set();
  lines.on('line', (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return send({ jsonrpc: '2.0', id: null, error: { code: JSONRPC.parse, message: 'Parse error' } });
    }
    const task = handle(message).catch((err) => console.error(`mcp-server: ${err.stack ?? err}`)).finally(() => inflight.delete(task));
    inflight.add(task);
  });
  // stdin closed: let the calls in flight answer before exiting.
  lines.on('close', () => {
    handle.abort();
    Promise.all(inflight).then(() => process.exit(0));
  });
}
