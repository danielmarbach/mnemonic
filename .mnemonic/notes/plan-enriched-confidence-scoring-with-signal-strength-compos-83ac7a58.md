---
title: 'Plan: Enriched confidence scoring with signal-strength composite'
tags:
  - workflow
  - plan
  - confidence
  - ranking
  - semvec
lifecycle: temporary
createdAt: '2026-05-09T15:34:27.654Z'
updatedAt: '2026-05-09T15:34:41.324Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-semvec-retention-formula-deep-dive-applicability-to-a5a31ecd
    type: derives-from
memoryVersion: 1
---
## Plan: Enriched Confidence Scoring with Signal-Strength Composite

Derive a richer confidence signal for recall results using existing, already-in-memory structural signals. Additive, fail-soft, no new infrastructure or ranking behavior changes.

### Step 1: Define and implement the signal-strength composite

Add `computeSignalStrength(note, projectContext)` to `src/provenance.ts`:

```text
signalStrength = roleWeight + centralityWeight + lifecycleWeight + recencyWeight
```

Where each term uses general heuristics (no repo-specific tuning):

- roleWeight: summary=0.15, decision=0.10, plan=0.08, context=0.05, reference=0.05, other=0.0 (explicit only)
- centralityWeight: min(0.15, log(relations+1) * 0.05) — maps 0 relations to 0, 20+ relations to 0.15 cap
- lifecycleWeight: permanent=0.10, temporary=0.0 (permanent notes are more trustworthy)
- recencyWeight: 0.10 * max(0, 1 - days/90) — linear decay to 0 at 90 days

Total range: approx [0, 0.50]. Values above 0.30 indicate strong multi-signal support. This is broader and more nuanced than the current binary confidence tiers while remaining a single numeric value agents can interpret.

**Important constraint:** All signals come from note frontmatter + session cache. No graph traversal beyond relations count. No embedding access. This keeps it generalizable — a note with 20 related summaries is stronger than one with 2, regardless of which repository those notes belong to.

### Step 2: Expose signalStrength in RecallResult

Add optional `signalStrength?: number` to the `RecallResult` interface and Zod schema in `src/structured-content.ts`. Include in tool description prose and schema description. Populate after existing confidence computation in the recall handler. Fail-soft — omit on any computation error.

### Step 3: Update confidence score derivation

Modify `computeConfidence` in `src/provenance.ts` to accept the enriched signal:

```text
high:   signalStrength >= 0.35
medium: signalStrength >= 0.15
low:    otherwise
```

This replaces the current coarse heuristic (permanent+central+recent => high, <90d => medium, else low) with a dimensional composite. Existing permanent/central/recent signals are already captured in the roleWeight, centralityWeight, lifecycleWeight, and recencyWeight terms, so no information is lost. The composite is more robust because it doesn't require ALL signals to fire simultaneously for "high" — strong centrality alone can reach medium, strong role+lifecycle alone can reach medium, etc.

### Step 4: Integration tests

Test in `tests/recall-pipeline.integration.test.ts`:

- Verify `signalStrength` appears in recall responses for project contexts
- Verify `signalStrength` is omitted (not error) when computation fails
- Verify confidence tier mapping: high/medium/low from signalStrength thresholds
- Schema validation: MCP response parses through exported Zod schema

### Step 5: Unit tests

Test in `tests/provenance.unit.test.ts`:

- Correct signalStrength for each role, lifecycle, relation-count combination
- Correct decay: 0-day note vs 30-day vs 100-day note
- Edge cases: zero relations, no role, temporary lifecycle

### Step 6: Dogfooding — measurable improvement validation

Before marking plan complete, run existing dogfooding Pack A (core enrichment/orientation) to confirm no regression. Then run a targeted evaluation:

**Semvec-inspired dogfooding pack:** Query the mnemonic vault for notes about ranking/signals/confidence/retrieval and verify:

- Higher signalStrength correlates with notes an agent should trust more (design decisions, summaries, well-connected notes)
- Lower signalStrength correlates with newer/isolated/temporary notes
- The confidence tier mapping is not obviously wrong on any major note
- No note gets signalStrength=0 that should clearly be trusted (false negative check)
- No note gets signalStrength>0.35 that is clearly wrong (false positive check)

**Generalizability check:** Verify that no signal weight was tuned specifically to this vault. For example, if changing roleWeight for "summary" from 0.15 to 0.17 flips many results, that weight is too fragile and needs adjustment. The signal must work with reasonable defaults across vaults — not be calibrated to fit this one.

Record dogfooding results as an apply note linked to this plan.

### Success criteria (measurable)

- [ ] signalStrength present in RecallResult for project-context recall calls
- [ ] signalStrength omitted gracefully (no error) on failure paths
- [ ] Confidence tier distribution is reasonable on this vault (not all high, not all low)
- [ ] Dogfooding confirms: higher scores match agent expectation of "should trust this"
- [ ] Integration and unit tests pass
- [ ] npx tsc --noEmit clean
- [ ] No new I/O introduced (audit: all fields from session cache + frontmatter)
- [ ] Generalizability: no weight was chosen by optimizing against this specific vault

### Non-goals

- No new ranking axis or scoring formula in the recall pipeline
- No new persistent state or metadata fields on notes
- No automatic eviction or garbage collection
- No semantic analysis of note content (embedding-agnostic)
- No access-count tracking

### Derives-from

- research-semvec-retention-formula-deep-dive-applicability-to-a5a31ecd
- research-semvec-analysis-applicability-and-alignment-with-mn-7a42ac50
- reference-mnemonic-ranking-signals-inventory-all-scoring-for-27ae79dc
