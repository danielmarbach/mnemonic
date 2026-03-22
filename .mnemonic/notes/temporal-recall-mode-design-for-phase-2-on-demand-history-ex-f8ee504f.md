---
title: Temporal recall mode design for Phase 2 on-demand history exploration
tags:
  - design
  - recall
  - temporal
  - git
  - decision
  - architecture
lifecycle: permanent
createdAt: '2026-03-22T12:42:10.838Z'
updatedAt: '2026-03-22T12:42:24.212Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: phase-1-provenance-confidence-implementation-design-c2084fd4
    type: related-to
memoryVersion: 1
---
Phase 2 adds an opt-in temporal recall mode for on-demand history exploration without changing default recall behavior.

Core decision:

- Extend `recall` with `mode: "temporal"`.
- Default recall remains unchanged in behavior, ranking, and latency expectations.
- Temporal mode is explicit only; do not auto-trigger it from the query yet.

Retrieval pipeline:

1. Run normal semantic recall first, including existing project bias.
2. Only after semantic selection, fetch git history for the top N matching notes.
3. Enrich results with a separate `history` field while preserving existing `score`, `provenance`, and `confidence` fields.

History shape:

```ts
{
  note: { ...existing fields },
  provenance: { ...existing Phase 1 fields },
  history: [
    {
      commitHash: string,
      timestamp: string,
      message: string,
      summary?: string
    }
  ]
}
```

Git design constraints:

- Git is a read-only history source.
- Add helpers in `git.ts`:
  - `getFileHistory(filePath: string, limit: number): Commit[]`
  - `getCommitStats(filePath: string, commitHash: string): { additions: number; deletions: number; filesChanged: number; }`
- Handle missing repo, missing file history, and command failures gracefully.
- Avoid locale-dependent parsing.
- Fail soft and return empty or minimal history data instead of failing recall.

History summarization design:

- Default temporal output must be compact and RTK-inspired rather than raw diffs.
- Each history item should always include `commitHash`, `timestamp`, and `message`.
- Add optional compact summaries derived from diff stat style data, such as:
  - `+42/-10 lines`
  - `3 files changed`
  - `minor edit`
  - `substantial update`
  - `metadata-only change`
- Never return large raw diffs from normal temporal recall.
- If summarization fails, still return usable history entries with hash, timestamp, and message.

Verbose escape hatch:

- Support `verbose: true` only together with `mode: "temporal"`.
- Verbose mode may include slightly richer summaries such as expanded stats or the first diff hunk.
- Even in verbose mode, avoid full diffs by default.
- Primary purpose is debugging and advanced inspection.

Performance constraints:

- Temporal mode must remain bounded.
- Only inspect history for top N notes, roughly 3-5 notes.
- Only fetch a small number of commits per note, roughly 3-5 commits.
- Avoid repo-wide scans.
- Cache repeated git lookups within a single request if useful.
- No impact on default semantic recall latency when temporal mode is not used.

Non-goals for Phase 2:

- No repo-wide timelines.
- No cross-note history stitching.
- No heavy diff output.
- No replacement of semantic recall with git traversal.
- No RTK-style command proxying or interception.

Intended user value:
Temporal recall should help agents answer questions such as:

- What changed recently?
- How did this evolve?
- Why is this note like this?

Future extensions explicitly deferred:

- Semantic change summaries such as shifts from one concept to another.
- Cross-note temporal correlation.
- Audit mode built on temporal plus provenance.
