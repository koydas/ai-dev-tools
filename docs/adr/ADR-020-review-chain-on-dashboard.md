# ADR-020 — Review-Chain Figures on the Dashboard: Observational, Never Eval Scores

**Status:** Accepted  
**Date:** 2026-10-22

## Context

ADR-019 left the Evals page empty ("Not instrumented") and said wiring data later means an optional sidecar key and a renderer. `scripts/review-chain-metrics.mjs` now extracts signals of the `/pr-review` → `/pr-fixer` chain from PR history. They are proxies: a finding is "touched" when a later commit changed the file it cites, not when it was fixed; a human thread "beyond the review" is a thread on a file no report cited. There is no labelled dataset, so nothing here measures recall or precision.

## Decision

1. **Optional `review_chain` key in the sidecar**: `{ generated, scope?, aggregate }`, where `aggregate` is the output of `review-chain-metrics.mjs` as is. Validated field by field like the rest (counts are integers, rates are `null` or in [0, 1], `reviewed ≤ prs`, beyond ≤ after). Absent key → no section, no tile.
2. **Shown as observational, never as evals.** The Evals page keeps its "Not instrumented" card; the figures sit in a separate "Review chain · observational" card whose caveat says they are proxies, not eval scores. The Overview "Agent evals" tile stays "Not instrumented"; a separate "Review chain" tile shows reviewed / sampled PRs (coverage), not a rate.
3. **Unknown is `n/a`**, never 0 (ADR-011 rule, carried through the extractor).
4. **Small samples are labelled.** Below `SMALL_SAMPLE` (10) reviewed PRs a callout above the table says a rate cannot be read. The threshold is a display choice, not a statistical bound.
5. **Hand-fed, like the rest of the sidecar**: `node scripts/review-chain-metrics.mjs --repo <o/r> --recent <n>` → paste `generated` and `aggregate` into the sidecar, with a `scope` naming repo and window. Per-PR records stay out of the sidecar.

## Alternatives considered

- **Fill the "Agent evals" tile with these figures** — rejected: it would present proxies without ground truth under the name of evals, the opposite of ADR-019 §4.
- **Show rates only above a minimum sample** — rejected: hides the data the reader needs to judge it; the caveat does the job.
- **Per-PR table on the page** — more detail, but PR titles and numbers from several repos are free text to escape and keep current; not needed for the first version.

## Consequences

- ✅ The dashboard shows the review chain's real usage (coverage) and first signals without claiming more than they are.
- ✅ A malformed `review_chain` fails the deploy instead of publishing wrong data.
- ⚠️ Figures are a snapshot of one repo and window, maintained by hand; they go stale until the extractor is run again.
- ⚠️ Proxy bias stays: reviewed PRs are not a random sample, and "touched" over-counts (a nit file edited for another reason).
