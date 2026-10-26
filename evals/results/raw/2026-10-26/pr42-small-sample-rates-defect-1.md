### Status
DONE — the overview now uses the autonomous-dev-loop shell, fits one screen, and has a Loop switch. Tests pass. There are no blocking issues.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md` | PASS — 245/245 |
| Build smoke | `node scripts/build-dashboard.mjs --out <scratch dir>` | `scripts/build-dashboard.mjs` CLI | PASS — wrote `index.html`, `observations.html`, `evals.html`, `status.json`; `status.json` is valid |
| Lint | — | — | N/A — no linter configured |
| Type-check | — | — | N/A — no type-checker configured |
| Reproduction | — | — | N/A — builder gave no `### Reproduction` or `### Non-regression evidence` |

I did not open the rendered pages in a browser or check them at 375 px. The one-screen claim is from reading the markup and the ADR, not from a rendering.

**AC coverage**
- [x] Same shell as autonomous-dev-loop — covered in `scripts/build-dashboard.mjs:179-277`. It uses the same colour tokens with light/dark by `prefers-color-scheme`, plus the same header and phone tab bar. ADR-021 records the decision.
- [x] One-screen overview — covered in `renderOverview` (`scripts/build-dashboard.mjs:298-306`). It has a status line and Tests, Observations and Quality rows, with chips linking to `observations.html#obs-<id>` and `evals.html#review-chain`. The anchors exist at lines 328 and 345.
- [x] Loop switch — covered in `scripts/build-dashboard.mjs:270,277`. The last tab-bar slot is Loop and the header has a "Dev loop ⇄" link, both pointing to `LOOP_DASHBOARD_URL`. The test at `tests/build-dashboard.test.mjs:132-137` checks it.
- [x] ADR-021 — added as `docs/adr/ADR-021-uniform-dashboards.md`. `README.md` and `docs/dashboard.md` are updated. `status.json` and `healthStatus` have tests.

**Bugs / regressions**
- None found.

**Scope violations**
- None. All five touched files relate to the dashboard.

**Missing tests**
- None blocking.

**Blocking issues**
- None.

**Non-blocking notes**
- `nit`: `scripts/build-dashboard.mjs:302` builds the chip href with `encodeURIComponent(o.id)`, but the anchor at line 328 uses `e(o.id)` (HTML-escaped). For ids with special characters, the chip link and the anchor would not match. Current ids are plain, so this has no effect today.
- `nit`: `scripts/` changed but `.claude-plugin/plugin.json` still has version 0.4.1. `CLAUDE.md` asks for a bump only when the change must reach plugin installs. This script is a CI build tool, so a bump is probably unnecessary.

### Handoff
Ready for human review and merge.
