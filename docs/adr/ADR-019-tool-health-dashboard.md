# ADR-019 — Tool-Health Dashboard: Static Pages Built from Observation Sidecars

**Status:** Accepted  
**Date:** 2026-10-22

## Context

`autonomous-dev-loop` publishes a dashboard fed by a metrics branch of per-run records. `ai-dev-tools` has no such record stream: its commands run in a developer's session and write nothing back. What it does have is the test suite and the observation reports of `docs/observations/` (free-form Markdown, mixed FR/EN). The goal is a dashboard that is simpler to read than the loop's, and that never shows a number the repository cannot back.

## Decision

1. **Static HTML, no runtime.** `scripts/build-dashboard.mjs` (ADR-007) writes `index.html`, `observations.html`, `evals.html` into `_site/`: inline CSS, no script, no external asset, light/dark by `prefers-color-scheme`, responsive.
2. **Data = JSON sidecars.** `docs/observations/<date>.json` next to the Markdown report: `schema_version: 1`, `date`, `tests {passed,total}`, `observations[{id,title,summary,status,date}]`, optional `source` and `review_evidence {PASS,FAIL,NOT_RUN,PRE_EXISTING}`. Status ∈ `open | unverified | fixed | not_applicable`. The builder validates field by field (error names the path) and renders the newest set by `date`. Markdown is never parsed.
3. **Escape everything.** Every sidecar string goes through `escapeHtml`; free text is data (same stance as ADR-017).
4. **Evals are explicitly absent.** No agent eval set exists, so the Evals page and tile read "Not instrumented". No placeholder figures. Wiring them later means adding an optional sidecar key and a renderer, not a new architecture.
5. **Publication.** `.github/workflows/dashboard.yml` tests, builds and deploys to GitHub Pages on a push to `main` touching the sidecars or the builder.

## Alternatives considered

- **Parse the Markdown reports** — no duplication, but the format is free-form and bilingual; a wording change silently breaks the dashboard.
- **Per-run metrics branch like ADL** — needs instrumentation of commands that run on developer machines; out of scope for a first, honest version.
- **SPA / charting library** — adds a build chain and dependencies for six numbers.

## Consequences

- ✅ Readable in seconds, zero dependencies, tested (`tests/build-dashboard.test.mjs`).
- ✅ A malformed sidecar fails the deploy instead of publishing wrong data.
- ⚠️ The sidecar duplicates a few facts of the Markdown report (test count, statuses) and is maintained by hand with it. Accepted until an automated producer exists.
- ⚠️ Pages must be enabled once (Settings → Pages → Source: GitHub Actions).
- ⚠️ No time series and no period selector: one session's snapshot, as the footer states.
