---
title: >-
  Research: Semvec retention formula deep-dive — applicability to mnemonic
  ranking
tags:
  - workflow
  - research
  - semvec
  - retention
  - ranking
lifecycle: temporary
createdAt: '2026-05-09T15:19:01.021Z'
updatedAt: '2026-05-09T21:04:35.045Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-semvec-analysis-applicability-and-alignment-with-mn-7a42ac50
    type: derives-from
  - id: reference-mnemonic-ranking-signals-inventory-all-scoring-for-27ae79dc
    type: derives-from
  - id: enriched-confidence-scoring-with-signal-strength-composite-i-06563116
    type: derives-from
memoryVersion: 1
---
## Research: Semvec Retention Formula Deep-Dive

### The Semvec Formula

RetentionScore = 0.4 *importance + 0.35* recency + 0.25 * access

Used for automatic eviction — when a memory tier overflows, lower-scoring entries are evicted regardless of age.

### Fundamental Architectural Mismatch: Purpose

Semvec's formula is designed for automatic garbage collection. Mnemonic has no automatic eviction — it uses explicit lifecycle management (temporary/permanent, consolidation via supersedes/delete). The formula's purpose doesn't map.

### The Access Count Gap: Why It Doesn't Work

Access count requires tracking how often each note is retrieved. This would require persistent counters updated on every recall call, violating several core constraints: metadata-only changes don't re-embed, no database, write I/O on read paths, and git-backed architecture would generate constant dirty state. Access count is architecturally impossible in mnemonic.

### What Mnemonic Already Has

Mnemonic's signals serving as importance proxies are richer than semvec's single dimension:

- Graph centrality: log(relations + 1) weighted at 0.4 in anchor scoring, capped at 0.05 in canonical promotion
- Role: explicit (summary > decision > reference > context), each with distinct weights per context
- Lifecycle: permanent vs temporary, with permanent getting +0.05 in canonical promotion
- Structure richness: heading count, bullet count, checklist count, computed in working state score
- AlwaysLoad: explicit +0.45 in anchor scoring, the single largest metadata boost
- Connection diversity: distinct theme count among related notes, weighted at 0.4 in anchor scoring

Mnemonic's importance is already a richer composite than semvec's single dimension — just decomposed across multiple additive terms.

### Where an Enriched Signal Could Add Value

Rather than adding a new ranking axis, the most defensible addition is enriching the confidence score with a richer signal composite:

- Enrich confidence score: currently very coarse (permanent+central+recent => high, less than 90d => medium, else low). Could derive from richer composite: role weight + centrality + lifecycle + recency + structural richness.
- Add signalStrength to retrievalEvidence: a composite score from existing signals that helps the agent understand why a result is high-quality.
- Leverage existing importance inference: suggestImportance() already derives importance from graph signals + structure. Could expose its intermediate score rather than just binary high/normal.

### Recommendation

Do NOT add a new ranking axis. The signals semvec uses are already present in mnemonic's ranking, decomposed across multiple additive terms.

DO consider enriching the confidence score with a richer signal composite. Additive, fail-soft, uses already-in-memory data, and helps the agent interpret results without changing ranking behavior.

### Design Constraints Check

- No new I/O (all signals from session cache / frontmatter)
- Additive, fail-soft (optional field, omit on computation failure)
- No heuristic write-back (read-only enrichment)
- Language-independent (structural signals only)
- Metadata-only changes don't re-embed (no new persistent state)
