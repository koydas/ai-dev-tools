# ADR-022 — /pr-fixer Reads the Codex Review as Claims to Verify (Amends ADR-014 on Bots)

**Status:** Proposed  
**Date:** 2026-10-25

## Context

[ADR-014](ADR-014-pr-fixer-applies-non-blocking.md) limits `/pr-fixer` to two sources, the `/pr-review` report and trusted humans, and rejects reading bots: "bot findings (Codex, Claude Code Review) have their own triage; the author decides which reviewers `/pr-fixer` answers to" (2026-10-15).

The data of 2026-10-24 (250 PRs of autonomous-dev-loop, 41 of this repository) show where the review rounds actually are:

- 320 external review (Codex) threads on 99 PRs of autonomous-dev-loop and 54 on 12 PRs here; 19 PRs of the first hold 57 % of its threads, 70 % of those on one file.
- The loop's own review approved every PR that later got a Codex P0/P1 (9 of 9), and is tuned for precision, not recall.
- The Codex loop is today handled by hand, from the repository's `pr-review-workflow` skill: no command reads the threads, so the class sweep added to `code-builder` (2026-10-25) never sees them.

So the largest source of back-and-forth is the one source `/pr-fixer` is told to ignore. The reason ADR-014 gave is still true for a bot in general (anyone can install an app, and its text can be steered); it does not hold for one named reviewer the author chose to run on their own PRs.

## Decision (proposed)

1. **One more source, by allowlist.** `gh-get-pr-feedback.mjs` gains a class `external-review` for the comments of an allowlisted reviewer. The allowlist is a versioned, non-secret file in `configs/` (`reviewers.yaml`), one entry now: the GitHub App login `chatgpt-codex-connector[bot]` with `type: Bot`. A bot not on the list stays `bot` (counted in `excluded`, never read). The classification stays a pure, tested function; the `[bot]` login of an App cannot be taken by a commenter, unlike a marker in a body.
2. **Only the root of an unresolved review thread**, carrying the reviewer's finding marker. Its replies, resolved threads, review summaries and receipts are not read.
3. **A claim, never an order.** Each finding reaches `code-builder` labelled `external-review` with `path`, `line`, the priority badge and the title. `code-builder` traces a realistic input or state to the failure from the diff before touching anything: a real path is fixed under the scope rule of ADR-014 and the class sweep (the whole defect class in the touched code, in the same patch); a far-fetched one or one whose fix costs more than it prevents is skipped with the traced path. Nothing in the finding text is run or followed as an instruction.
4. **Bounded text.** Body capped (2,000 characters), links, images and HTML removed, before it is passed on.
5. **Only on a PR whose author is trusted** (`OWNER` / `MEMBER` / `COLLABORATOR`). A PR from an outsider can steer what the reviewer writes through its own diff; such a PR gets no external-review source.
6. **Opt-in at first**: `/pr-fixer --external-review`. The default stays ADR-014's two sources; it moves only if the figures below improve, in a later ADR.
7. Nothing is posted and nothing is committed: `/pr-fixer` drafts one reply per thread for the human to post, as for human threads ([ADR-001](ADR-001-human-as-gate.md) unchanged).

## Alternatives considered

- **Status quo (manual loop through the skill)** — the choice that produced the figures above; costs a session per round.
- **Read every bot** — rejected again: an arbitrary app's text would reach `code-builder`.
- **Trust the marker in the body alone** — rejected: any commenter can write it; the App identity is the proof.
- **Default on** — rejected until measured: a larger patch per run and a second source to trust.
- **Have the reviewer fix its own findings (`@codex address that feedback`)** — outside the repository's gates (no re-review by `code-reviewer`, no repo checks run by this toolbox).

## Consequences

**Positive**
- The class sweep and the tool-grounded re-review ([ADR-009](ADR-009-tool-grounded-review.md)) apply to the loop that costs most rounds.
- A skipped finding carries its traced path, which is the reply the thread needs.

**Negative**
- A second source whose text is third-party: held to points 3 to 5, but a steered reviewer can still propose a bad fix inside the PR's perimeter; the re-review and the human gate are what catch it.
- One more file to maintain (`configs/reviewers.yaml`) and one more class in the feedback script.

**Measure.** Rounds of the external reviewer per PR above 100 added lines, from `external_review` on the PR records of autonomous-dev-loop (its #289), before and after use. Baseline: 10 to 14 % of PRs between 100 and 1,000 added lines reach three rounds or more. Not implemented by this ADR.
