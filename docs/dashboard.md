# Tool-health dashboard

Static pages summarising the latest local observation session: tests, observations by status, review-evidence vocabulary. Design record: [ADR-019](adr/ADR-019-tool-health-dashboard.md).

## Build

```bash
node scripts/build-dashboard.mjs [--observations <dir>] [--out <dir>]   # defaults: docs/observations, _site
```

Open `_site/index.html`. Deployed to GitHub Pages by `.github/workflows/dashboard.yml` (one-time: Settings → Pages → Source: GitHub Actions).

## Update the data

Add `docs/observations/<date>.json` beside the Markdown report; the newest `date` wins.

```json
{
  "schema_version": 1,
  "date": "2026-10-22",
  "source": "docs/observations/2026-10-22-scripts-cloud-session.md",
  "tests": { "passed": 160, "total": 160 },
  "observations": [
    { "id": "O1", "title": "GraphQL in cloud sessions", "summary": "…", "status": "fixed", "date": "2026-10-22" }
  ],
  "review_evidence": { "PASS": 0, "FAIL": 0, "NOT_RUN": 0, "PRE_EXISTING": 0 }
}
```

`status`: `open` · `unverified` · `fixed` · `not_applicable`. `source` and `review_evidence` are optional. An invalid field fails the build with its path (`f.json: observations[2].status must be one of …`).

## Pages

| Page | Content |
|---|---|
| Overview | Tests run, observations fixed (and how many are not conclusive), agent evals tile, follow-up list (open and unverified first, max 4), review-evidence legend |
| Observations | Every observation, open first |
| Evals | "Not instrumented" until an eval set exists |
