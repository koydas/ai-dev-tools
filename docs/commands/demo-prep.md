# /demo-prep

Turn a sprint's completed features into a structured, slide-ready demo script.

## Purpose

Transforms raw PR titles and issue descriptions into polished, non-technical demo talking points — with headlines, before/after framing, and a live demo walkthrough path for each feature.

## Invocation

```
/demo-prep
```

You will be prompted for the sprint's date range or milestone if it cannot be inferred.

## What it does

1. Gathers completed work (merged PRs, closed issues) for the sprint
2. For each feature, generates:
   - Headline (user benefit framing, one sentence)
   - What changed (problem + solution, two sentences)
   - Live demo path (step-by-step instructions)
   - Before/After (where applicable)
3. Assembles a full demo script with opening, walkthroughs, and closing
4. Presents the draft; iterates based on your feedback

## Output

A demo script structured as:

```
Sprint N Demo

Opening: [sprint goal / theme]

1. [Feature headline]
   What changed: ...
   Demo path: ...

2. ...

Closing: [what's next]
```

## See also

- [`scripts/gh-get-pr.mjs`](../../scripts/gh-get-pr.mjs) — fetches PR details used as input
