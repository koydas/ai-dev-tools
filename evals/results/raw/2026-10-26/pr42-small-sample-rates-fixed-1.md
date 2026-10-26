### Status
DONE — the diff covers the acceptance criterion (same shell as autonomous-dev-loop, one-screen overview, Loop switch). The test suite passes. I checked this from the tests and code only, and did not render the page at 375 px.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests | `node --test` | `CLAUDE.md` (Tests) | PASS — 245/245, 0 failures |
| Reproduction | — | — | N/A — no builder evidence supplied |
| Lint | — | — | N/A — no linter configured |
| Type-check | — | — | N/A — none configured |

**AC coverage**
- [x] Same shell as autonomous-dev-loop — ADR-021 decision 1 is documented in `docs/adr/ADR-021-uniform-dashboards.md`. The shell is implemented in `scripts/build-dashboard.mjs`: copied colour tokens, `prefers-color-scheme` theming, the header with a companion link, and the phone tab bar.
- [x] One-screen overview — `renderOverview` renders a status line plus Tests, Observations and Quality rows.
  - There is no placeholder card, and the review-evidence vocabulary moved to the Observations page.
  - Chips link to `observations.html#obs-<id>` and `evals.html#review-chain`.
  - `tests/build-dashboard.test.mjs` asserts all of this.
- [x] Loop switch (ADR-021) — `LOOP_DASHBOARD_URL` is the last tab-bar slot (`app-switch`, "Loop") and also appears in the wide-screen header ("Dev loop ⇄", `scripts/build-dashboard.mjs:270,277`).
  - Tests check that the tab bar ends with the switch on every page.
  - `status.json` is a new output, written by `statusJson` (`scripts/build-dashboard.mjs:168`) and covered by tests.

**Bugs / regressions**
- None found. `buildDashboard` now returns four files instead of three, and the test was updated to match.
- No `<script>` or external asset was added, which keeps ADR-019 intact.
- Sidecar strings are still escaped (existing test).

**Scope violations**
- None. The changes are limited to the dashboard script, its test, its docs, the README row and the new ADR.

**Missing tests**
- None significant. Covered: `healthStatus` for bad, warn and ok; `status.json` contents; chips; the small-sample case; and the Loop switch.

**Blocking issues** (must fix before merge)
- None.

**Non-blocking notes**
- `nit`: `LOOP_DASHBOARD_URL` is hard-coded. A comment saying it must match the companion repo's Pages URL would help.
- `nit`: `build-dashboard.mjs` changed under `scripts/`. `CLAUDE.md` asks for a `.claude-plugin/plugin.json` version bump only when the change must reach plugin installs. The dashboard is built in CI, so none is likely needed. I did not check whether `docs/commands/` has anything to update.

### Handoff
Ready for human review and merge.
