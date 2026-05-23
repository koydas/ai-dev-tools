# ADR-008 — GitHub Actions CI Workflow

**Status:** Accepted  
**Date:** 2026-05-23

## Context

The project already has a unit test suite (`tests/sync-claude.test.mjs`) using the native `node:test` module, but no CI pipeline existed. Tests were only run manually, providing no automated feedback on push or pull request.

## Decision

A **GitHub Actions workflow** (`.github/workflows/ci.yml`) runs `node --test` on every push and pull request. Node's built-in test runner auto-discovers files matching `**/*.test.{js,cjs,mjs}`, requiring no additional configuration.

No `package.json` or external test framework is introduced. Node 20 is already the minimum runtime required by the project (ADR-007).

## Consequences

**Positive**
- Every push and PR gets immediate test feedback without any local setup
- No new dependencies — `node:test` is built into Node ≥ 18; no `npm install` step needed
- A CI status badge on the README communicates health at a glance
- New test files are discovered automatically as the test suite grows

**Negative**
- The workflow is coupled to GitHub Actions; migrating to another CI provider requires rewriting the YAML
- `node --test` auto-discovery follows Node's naming conventions — test files must use `.test.mjs` (or `.test.js`/`.test.cjs`) to be picked up

## Alternatives considered

- **Jest or Vitest** — would require a `package.json` and npm install step; rejected to avoid adding a dependency layer (consistent with ADR-007's minimal-dependency stance)
- **Shell `make test` target** — a Makefile was considered but adds another tool with no other use case in this project
- **Running tests only on `main`** — rejected; CI feedback is most valuable on feature branches and PRs, before merge
