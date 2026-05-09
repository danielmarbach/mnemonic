---
title: 'Research: Semvec analysis — applicability and alignment with mnemonic'
tags:
  - workflow
  - research
  - paper-analysis
  - semvec
  - semantic-state
lifecycle: temporary
createdAt: '2026-05-09T15:11:26.439Z'
updatedAt: '2026-05-09T15:24:15.017Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-semvec-retention-formula-deep-dive-applicability-to-a5a31ecd
    type: derives-from
memoryVersion: 1
---
## Research: Semvec Analysis for mnemonic

### Summary

Semvec is a proprietary, patent-pending persistent semantic state engine by Michael Neuberger (Versino PsiOmega GmbH). Core innovation: compress conversation history into a fixed-size 384d or 768d state vector updated via EMA, giving constant O(1) per-turn LLM input cost regardless of conversation length.

### Copyright & IP Risk: CRITICAL

- License: `LicenseRef-Proprietary` — all rights reserved
- Patent: EP 25 188 105.8 — patent-pending at European Patent Office
- Source: Closed (Rust, held privately)
- Commercial use: Requires Pro/Enterprise license

Any direct code reuse is a non-starter. The patent application covers the core mechanism; even independent implementation of the patented method could create exposure once granted.

What is defensible: general mathematical concepts (EMA vectors, cosine similarity, tiered storage, retention scoring formulas) predate semvec and are standard techniques. The specific novel combination — the "semantic state vector" engine as a product — is what's protected.

### What's Applicable (Idea Level, Not Code)

**1. Tiered memory with selective forgetting** — semvec's 3-tier model (short/medium/long) with retention scoring maps conceptually to mnemonic's temporary/permanent lifecycle, but mnemonic's approach is lifecycle-driven (temporary → consolidated → permanent) while semvec's is access-pattern-driven. Mnemonic already has a cleaner model — consolidation is explicit and human/agent-driven, not an opaque retention score.

**2. Domain anchor concept** — semvec's anchors (reference embeddings pulling retrieval toward known domains) maps to mnemonic's existing `alwaysLoad`, anchor notes in `project_memory_summary`, and project-bias similarity boost (+0.15). Mnemonic already has the concept.

**3. Conversation phase detection** — semvec's automatic 6-phase detection is genuinely novel but is a runtime concern requiring live conversation observation. Mnemonic is a stateless MCP server — this belongs in the consuming agent.

**4. Fixed-size O(1) state vector** — This is semvec's core patent-pending innovation. Fundamentally incompatible with mnemonic's file-based architecture. Collapsing notes into a single EMA vector would destroy the explicit, addressable nature of each note — violating "one file per note" and "explicit metadata outranks inferred" constraints.

**5. Verbatim LiteralCache** — Functionally equivalent to mnemonic's explicit notes with structured metadata. No gap.

**6. Token-efficiency emphasis** — Semvec's constant-cost model highlights token discipline. Mnemonic already constrains: bounded limit (default 5, max 20), bounded relationship expansion (max 3), and recent vault-size awareness + diversity metrics.

### What's NOT Applicable

- Fixed-size state vector — fundamentally incompatible
- Conversation phase detection — belongs in consuming agent
- Multi-agent Cortex — no multi-agent surface in mnemonic
- Compliance event store — mnemonic uses git history; adding event store violates "no database" constraint
- Ed25519 JWT licensing — mnemonic is free/open

### Worthwhile Takeaway: Selective Forgetting Retention Formula

The retention scoring formula (0.4·importance + 0.35·recency + 0.25·access) is the most interesting pattern. Mnemonic's ranking already weights recency and centrality. The explicit importance dimension (0.4 weight) — currently absent but derivable from role, lifecycle, and relationship count — could improve ranking signal diversity. See companion deep-dive research.

### Assessment

No actionable adoption path for the core engine. Worth documenting for architectural awareness. The retention formula is the one worthwhile pattern worth deeper exploration.
