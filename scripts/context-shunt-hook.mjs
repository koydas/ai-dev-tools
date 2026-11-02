#!/usr/bin/env node
// Optional Claude Code PreToolUse routing: never approves a tool, only denies eligible large reads.
import { shouldShunt } from './context-shunt-policy.mjs';

export function decide(event, options = {}) {
  if (!shouldShunt(event, options)) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'Context Shunt: large whole-file read. Use /ai-dev-tools:context-read with a specific question and file path(s); it returns verified line citations. For exact edits or code review, use Read with offset/limit instead.',
    },
  };
}

if (process.argv[1]?.endsWith('context-shunt-hook.mjs')) {
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    data += chunk;
    if (data.length > 65536) process.exit(0);
  }
  try {
    const decision = decide(JSON.parse(data));
    if (decision) process.stdout.write(JSON.stringify(decision) + '\n');
  } catch {
    // Fail open: the tool's own permissions still apply.
  }
}
