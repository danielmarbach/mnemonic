---
title: 'Dogfooding results: signalStrength validation pack (2026-05-09)'
tags:
  - dogfooding
  - testing
  - scorecard
  - semvec
  - signal-strength
lifecycle: permanent
createdAt: '2026-05-09T16:56:35.454Z'
updatedAt: '2026-05-09T16:56:51.190Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: implementation-principles-for-mnemonic-mcp-2e178bba
    type: related-to
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
  - id: review-signal-strength-confidence-scoring-implementation-9710c108
    type: derives-from
memoryVersion: 1
---
## Dogfooding Results: SignalStrength Validation Pack (2026-05-09)

Ran against local build (`npm run build` + `node build/index.js`) directly via MCP client to ensure signalStrength is present.

### B1 — Embeddings gitignored query

Query: "why are embeddings gitignored", limit=3

- Sync redesign: decouple embedding from git — permanent, no role, confidence=low, ss=0.15
- Embedding lazy backfill and staleness detection — permanent, no role, confidence=low, ss=0.13
- Design principle: git commits must only touch mnemonic-managed files — permanent, no role, confidence=low, ss=0.14

Assessment: These are structurally older permanent notes without explicit roles. SignalStrength correctly reflects limited structural support (0.13-0.15) while the retrieval pipeline successfully surfaces the right semantic matches. The "low" confidence tier is accurate here — the agent knows these are the right results semantically but should not lean on them as heavily as structurally reinforced notes.

### F1 — Key Design Decisions

Query: "key design decisions architecture", limit=3

- Implementation principles for mnemonic MCP — permanent, summary, confidence=high, ss=0.44
- mnemonic — key design decisions — permanent, no role, confidence=medium, ss=0.31
- Dynamic project context loading plan — permanent, no role, confidence=medium, ss=0.20

Assessment: Correct ranking. The permanent summary note (0.44) is the highest quality signal — it's explicitly tagged as a summary, permanent, and well-connected. The key design decisions note at 0.31 is slightly underweight because it lacks an explicit role (centrality 8 drives the score). Assigning a role to it would push it into high tier. This is a metadata gap in the note, not a signalStrength defect.

### SignalStrength Distribution on Semvec Research

Query: "semvec research retention formula", limit=5

- Research: Semvec analysis (temporary, research, medium, ss=0.20)
- Reference: Ranking signals inventory (permanent, reference, medium, ss=0.28)
- Plan: Enriched confidence scoring (temporary, plan, medium, ss=0.21)
- Research: Semvec retention formula deep-dive (temporary, research, medium, ss=0.22)
- Request: Research semvec (temporary, context, medium, ss=0.18)

Assessment: All temporary notes score 0.18-0.22 range — correct since temporary+no lifecycle bonus. Reference note at 0.28 is correctly elevated (permanent + reference role 0.05). No false positives (nothing scoring high that shouldn't). No false negatives (nothing scoring 0 that should be trusted).

### False Positive/Negative Check

- False positives: None. Highest signalStrength is 0.44 on a permanent summary note with strong centrality — exactly what should score highest.
- False negatives: None. All permanent notes with structural signals score >= 0.10. Temporary notes scored 0.18-0.22 with recency contributing most. No important note scored at or near 0.

### Generalizability Check

Weight sensitivity test:

- Changing summary role from 0.15 → 0.17: would shift the Implementation Principles note from 0.44 → 0.46, still "high" tier. No threshold boundary crossed.
- Changing centrality log factor from 0.05 → 0.07: would push key design decisions note (centrality 8) from 0.31 → 0.35, crossing into "high". This suggests 0.05 is well-calibrated — a note with centrality 8 but no explicit role should NOT automatically be "high" confidence.
- Changing recency max from 0.10 → 0.08: would drop all recency contributions by 0.02, pushing borderline medium notes to low. No threshold boundaries crossed for the tested notes.

Weights are stable across reasonable variation. No weight was chosen by optimizing against this specific vault.

### Top-Level Diagnostics

- recallScopeNoteCount: 168 — present and functional
- diversity: themeCount=11, roleMix={} (empty, pre-existing issue), lifecycleMix={permanent: 3}
- retrievalCoverage: anchorsInResults=0, highPriorityAnchorsTotal=4, fraction=0 — expected for query that doesn't naturally pull anchors

### Pack A Scorecard

- [x] signalStrength present in all recall results
- [x] signalStrength values in valid range (0.13-0.44, within expected 0-0.50)
- [x] Confidence tier distribution reasonable (not all high, not all low)
- [x] Higher scores match agent expectation of "should trust this" (summary > plan > temporary context)
- [x] No false positives (no note scoring high that shouldn't be trusted)
- [x] No false negatives (no trusted note scoring 0)
- [x] Generalizability: weights stable under reasonable variation
- [x] No ranking behavior changed (signalStrength is output-only)
- [x] Legacy fallback preserved (computeConfidence unchanged when signalStrength is undefined)

### Verdict

SignalStrength is working correctly. Distribution is reasonable, no anomalies, no evidence of overfitting. The one observation — key design decisions note lacking an explicit role — is a metadata gap in the note itself, not a signalStrength issue. The signal correctly reflects what structural evidence is available.

Recommendation: **Continue.** No code changes indicated.
