# Tool-health dashboard

Static pages summarising the latest local observation session: tests, observations by status, review-evidence vocabulary, and — when present — observational review-chain figures. Design records: [ADR-019](adr/ADR-019-tool-health-dashboard.md), [ADR-020](adr/ADR-020-review-chain-on-dashboard.md), [ADR-021](adr/ADR-021-uniform-dashboards.md) (same shell as the autonomous-dev-loop dashboard, one-screen overview).

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
  "review_evidence": { "PASS": 0, "FAIL": 0, "NOT_RUN": 0, "PRE_EXISTING": 0 },
  "review_chain": {
    "generated": "2026-10-22",
    "scope": "koydas/ai-dev-tools, 30 latest closed PRs",
    "aggregate": { "prs": 30, "reviewed": 1, "reports": 1, "blocking_touched_rate": 1, "non_blocking_touched_rate": 1, "converged_rate": 0, "mean_rounds": 1, "human_threads_after_review": 0, "human_threads_beyond_review": 0 }
  }
}
```

`status`: `open` · `unverified` · `fixed` · `not_applicable`. `source`, `review_evidence` and `review_chain` are optional. An invalid field fails the build with its path (`f.json: observations[2].status must be one of …`).

## Pages

| Page | Content |
|---|---|
| Overview | One phone screen: status line (`bad`: a test fails or an observation is open; `warn`: one is not verified; else `ok`), then rows — **Tests** (opens the source report), **Observations** (fixed count, a chip per open or unverified observation, max 3, opening its row), **Quality** (review chain reviewed / sampled PRs with a chip per rate, or "Not instrumented") |
| Observations | Every observation, open first (`#obs-<id>` anchors), then the review-evidence legend with its counts |
| Evals | "Not instrumented" until an eval set exists; below it, the review-chain figures when `review_chain` is set (`#review-chain`) |
| `status.json` | `{ schema_version, app, generated_at, status, headline }`, same shape as autonomous-dev-loop's |

The phone tab bar ends with **Loop**, the autonomous-dev-loop dashboard (its own tab bar ends with **Tools**).

## Review chain

`review_chain.aggregate` is the `aggregate` of `scripts/review-chain-metrics.mjs`; copy it with its `generated` date and a `scope` naming the repo and window:

```bash
node scripts/review-chain-metrics.mjs --repo koydas/ai-dev-tools --recent 30   # --recent: 1..100
```

The figures are proxies from PR history, not eval scores (ADR-020): "touched" means a later commit changed the cited file, not that the finding was fixed. A rate that cannot be computed is `null` and shows `n/a`; under 10 reviewed PRs the page says a rate cannot be read.
