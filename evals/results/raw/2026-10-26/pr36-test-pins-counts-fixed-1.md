### Status
DONE — The dashboard builder, sidecar, workflow and ADR are in place, and the tests and a real build both pass.

### Review

**Evidence**
| Check | Command | Source | Result |
|---|---|---|---|
| Tests (full) | `node --test` | `CLAUDE.md` | PASS — 206/206 |
| Tests (new) | `node --test tests/build-dashboard.test.mjs` | `dashboard.yml` | PASS — 28/28 |
| Build | `node scripts/build-dashboard.mjs --out <scratch>` | `dashboard.yml` | PASS — wrote `index.html`, `observations.html`, `evals.html` |
| Lint | — | — | N/A — no linter configured |
| Type-check | — | — | N/A — none configured (plain ESM) |

**AC coverage**
- [x] Static dashboard: `scripts/build-dashboard.mjs` writes three HTML pages with inline CSS and no script.
- [x] Built from observation sidecars: `loadLatestSet` and `validateObservationSet` read `docs/observations/*.json`. The initial sidecar is `docs/observations/2026-10-22.json`.
- [x] Tests: `tests/build-dashboard.test.mjs`.
- [x] Publication and docs: `.github/workflows/dashboard.yml`, `docs/adr/ADR-019-tool-health-dashboard.md`, `docs/dashboard.md`, a README row, and `_site/` in `.gitignore`.
- [x] Repo conventions: ESM, a CLI entrypoint guarded with `fileURLToPath`, and no `exec` calls. Sidecar strings go through `escapeHtml`.

**Bugs / regressions**
- None found.

**Scope violations**
- None.

**Missing tests**
- None blocking.

**Blocking issues**
- None.

**Non-blocking notes**
- `nit`: `ISO_DATE` checks the format only, so `2026-13-45` passes validation. `formatDate` then falls back to printing the raw string.
- `nit`: The sidecar's `tests` count (160/160) is a hand-maintained snapshot of that session. The full suite now has 206 tests. ADR-019 already accepts this duplication.
- `nit`: `dashboard.yml` has no `pull_request` trigger, so a broken sidecar is only caught after merge to `main`. That fails the deploy rather than publishing bad data.

### Handoff
Ready for human review and merge. After merge, enable Pages once (Settings → Pages → Source: GitHub Actions), as ADR-019 notes.
