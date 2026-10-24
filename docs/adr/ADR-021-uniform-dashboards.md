# ADR-021 — One Dashboard Shell with autonomous-dev-loop: One-Screen Overview, Shared Tokens, Tab-Bar Switch

**Status:** Accepted  
**Date:** 2026-10-24

## Context

Two dashboards are read side by side on a phone (375 px, iPhone 13 mini): this one (ADR-019) and the autonomous-dev-loop console (its ADR-0043). They looked like two products — different palette, header, tab bar and theme rule — and neither linked to the other. This overview took about four screens for three numbers, with a placeholder card ("Agent trends — to be wired") repeating the "Not instrumented" tile.

## Decision

1. **Same shell as autonomous-dev-loop.** Same colour tokens (copied from its `scripts/lib/dashboard_ui.mjs`; light / dark values), the same header (brand mark, page links, companion link, repository) and phone tab bar, the same overview rows. Theme follows `prefers-color-scheme`, which is also autonomous-dev-loop's default since its 2026-10-24 amendment. No script: ADR-019 stands.
2. **The overview is one phone screen** (375 × ~630 CSS px): a status line, then **Tests**, **Observations** and **Quality** rows. Each row opens its page; each chip opens a filtered view (`observations.html#obs-<id>` for each open or unverified observation, `evals.html#review-chain` for each review-chain rate). The review-evidence vocabulary moves to the Observations page. The status is `bad` when a test fails or an observation is open, `warn` when one is not verified, else `ok` (`healthStatus`).
3. **One tap between the two.** The tab bar's last slot is **Loop** (`LOOP_DASHBOARD_URL`), and the loop's is **Tools**. The header carries the same link on wide screens.
4. **`status.json`** at the site root, same shape as the loop's: `{ schema_version, app, generated_at, status: ok | warn | bad, headline }`. Each dashboard publishes its own; neither reads the other's yet.

## Alternatives considered

- **Link the loop's stylesheet** (same origin, `koydas.github.io`): no copy, but a deploy of one repository restyles the other and the class names become a cross-repo contract.
- **A shared npm package**: an external dependency in two repositories that have none.
- **One site for both**: removes the switch, couples two release cycles and two data sources.

## Consequences

- ✅ The same reading habit on both: status, then rows, then drill-down.
- ⚠️ The tokens are a copy: a palette change on one side is repeated by hand on the other. Accepted for about 15 values.
- ⚠️ The switch shows no state of the other dashboard. Showing it (a coloured dot read from the other's `status.json`) needs a script, which ADR-019 rules out; it would be a separate decision.
