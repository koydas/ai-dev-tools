---
description: "Focused read-only Context Shunt extraction with locally verified citations"
argument-hint: '"question" --paths <file1> [more files]'
---

# /context-read

Answer a narrow codebase question without loading the entire source corpus into the primary model context.

1. Derive a **specific question** and explicit existing repository-relative file paths from $ARGUMENTS and the current task. Never invent paths. Use Glob/Grep to identify files before running.
2. Invoke `node "${CLAUDE_PLUGIN_ROOT}/scripts/context-shunt.mjs" --question "<specific question>" --paths <file1> [more paths]`. Pass the question and each path as safely quoted arguments; never use shell eval.
3. This requires `AI_DEV_TOOLS_CONTEXT_SHUNT=1` and `ANTHROPIC_API_KEY`. Eligible file contents are sent to Anthropic.
4. Report only the returned summary and locally verified exact path/line/quote citations. Quote verification establishes provenance, **not** that the summary's reasoning is correct.
5. If delegation fails, or an exact code edit/review is needed, use targeted Read with offset/limit. Never treat a worker error as success.

No writes, PR approvals, or changes to existing quality gates. See docs/context-shunt.md and ADR-022/023.
