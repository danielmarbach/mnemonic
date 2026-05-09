---
title: 'Research: CAG-Bench paper analysis — gaps and applications for mnemonic'
tags:
  - workflow
  - research
  - paper-analysis
  - cag-bench
  - memory-uptake
  - retrieval
lifecycle: temporary
createdAt: '2026-05-09T07:20:50.314Z'
updatedAt: '2026-05-09T07:42:17.389Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Research: CAG-Bench Paper Analysis for mnemonic

### Paper Summary

CAG-Bench evaluates three context strategies over 30 sequential interdependent tasks: RAG (source-only), DAG (fixed workflow + retrieval), CAG (persistent memory). On qwen2.5-coder:7b, CAG composite 48.5 vs RAG 29.6 vs DAG 28.5. Continuity recall 54.2% vs 17.1%/17.0%.

Key metrics: memory\_recall, memory\_precision, continuity\_recall, memory\_usage\_rate (uptake — what fraction of retrieved concepts appear in the final answer).

Memory variants: base cag (cap=25, 100% recall), cag\_scoped (K=5 label-informed, 80.7%), cag\_scoped\_promptonly (K=5 label-free, 60.9%), cag\_oracle\_memory (K=5 filtered ceiling, 80.7%).

### Scale: Not One Vault Size

Mnemonic's 106 notes are ONE data point. Users will have 10 to 500+ notes. Any design assuming "one vault size = cap=25 works" is wrong.

Vault-size-sensitive behavior:

- Vault < 30 notes: dump-everything (cap=25 or vault size) makes sense
- Vault 30-100 notes: scoped K=5-10 with good scoring
- Vault 500+ notes: very strict K=3-5, precision-dominant

Mnemonic already operates in scoped-retrieval for vaults above 25 notes. The question: does semantic+lexical+graph+canonical scoring match what label-informed retrievers achieve?

### What the Shallow 7-Phase Plan Gets Wrong

**Already exists:** Phase 2 (orientation via `project_memory_summary`), Phase 3 (graph spreading = diversity discovery), Phase 4 (`alwaysLoad` already explicit-only), Phase 5 (temporary/permanent lifecycle + consolidation), Phase 6 (projections already gitignored, `project_memory_summary` IS the orientation projection).

**Structurally impossible:** Phase 1 memory-uptake diagnostics: `memory_usage_rate` requires comparing retrieval output to final answer. Mnemonic is an MCP server — it provides retrieval but NEVER observes downstream agent response. Uptake is inherently a client-side concern.

**Aspirational only:** Phase 7 dynamic loading is already planned and correctly deferred.

### Five Genuine Gaps

#### Gap 1: No Memory Validation Gate

Paper uses grounded memory (task-defined promote\_summary, never model output). PersistBench: median 53% cross-domain leakage, 97% memory-induced sycophancy.

Mnemonic trusts agent-authored content. A hallucinated technical decision becomes indistinguishable from correct facts.

**Actionable?** No. Adding validation kills usability (human review) or conflicts with local-first (LLM-as-judge). Surface provenance/confidence as mitigation (already done).

#### Gap 2: No Retrieval Precision Measurement

Paper measures recall/precision against ground-truth continuity\_terms. Mnemonic has retrievalEvidence (channels, rankBand, freshness) — this explains HOW a result was selected but not WHETHER it should have been. These are retrieval-rationale signals, not retrieval-quality signals.

**Actionable?** Partially. Can add diversity metrics from existing data: theme count, role mix, lifecycle mix per recall. But true precision/recall requires a relevance model mnemonic doesn't and shouldn't have.

#### Gap 3: Scale-Adaptive Retrieval

Paper: optimal strategy depends on store size. Mnemonic `recall` has fixed `limit` (default 5, max 20) regardless of vault size.

**Actionable?** Yes. Simple heuristic:

- < 30 notes: default limit = min(vaultSize, 20)
- 30-100 notes: current default (5-10)
- > 100 notes: tighten or surface a hint

Pure parameter adjustment, no new infrastructure.

#### Gap 4: Token Efficiency Metrics Missing

Paper: `continuity_per_memory_token`. Mnemonic: provenance, confidence, evidence, relationships on each result — but no efficiency ratio.

**Actionable?** Yes. Add to structured `RecallResult`:

- `totalResults`: count returned
- `vaultSize`: total notes for context
  Agent computes its own efficiency ratio.

All derivable from in-pipeline data.

#### Gap 5: Uptake Is Real But Not the Server's Job

Paper: 38-63% of retrieved concepts used. Uptake gap (-47 points) surpasses retrieval gap (-19.8 points).

This is a model/client problem. Mnemonic can help indirectly:

- Better precision = less noise = higher uptake (done: canonical, graph, project bias)
- Clearer orientation = less context overload (done: `project_memory_summary`)
- Diversity-aware = fewer redundant results = less attention dilution (not yet done)

### What the Paper Confirms Mnemonic Does Right

1. File-first embedding-driven storage: persistent store beats source-only
2. Project bias essential: domain rule recall 56.4% for CAG vs 47.2% for RAG — project-specific constraints carried in accumulated memory improve output
3. Rich metadata improves ranking: label-informed vs label-free gap validates mnemonic's confidence/provenance/centrality signals
4. Orientation-first workflow: Phase analysis shows orientation matters most when concept space is large
5. Token discipline: focused K=5 can outperform cap=25 dumps in quality per token

### Concrete Actions (Non-Aspirational)

**Immediate (low risk, additive):**

1. Vault-size awareness in recall defaults — heuristic on `limit`
2. Diversity metrics in structured output — theme/role/lifecycle mix per result set
3. Token-efficiency context — `vaultSize`, `totalResults` in `RecallResult`
4. `retrievalCoverage` — fraction of vault anchors/alwaysLoad in results

**Medium-term (additive, fail-soft):**
5\. Diversity-aware result selection — after ranking, ensure theme/role/lifecycle spread
6\. Adaptive `limit` based on query specificity + vault size

**Deferred:**
7\. Memory validation gate — premature
8\. Uptake measurement — client-side, could be a client benchmark, not server feature

## Design Constraints That Must Hold

- No database, daemon, always-on service
- One file per note, embeddings gitignored
- Additive, bounded, reversible, fail-soft
- Language-independent, explicit metadata outranks inferred
- No auto-relationship via LLM
- Metadata-only changes don't re-embed
- Explicit metadata outranks inferred (no heuristic write-back)

## Verdict

The shallow analysis was directionally correct (memory uptake beats retrieval breadth) but over-engineered. Several phases already exist, one is structurally impossible at the MCP server level, and others are aspirational conventions.

The right next step is 2-3 concrete, low-risk additions to recall structured output (diversity metrics, vault-size context, anchor coverage) plus one medium-investment feature (diversity-aware selection). Everything else is deferred.

The paper's most important lesson for mnemonic is NOT about retrieval quality. It is that the retrieval system can be excellent and the model still won't use what was retrieved. Since mnemonic can't fix uptake directly, its job is to make retrieval output as useful, precise, and diverse as possible so the agent has the best chance of incorporating it into its answer.

- No database, daemon, always-on service
- One file per note, embeddings gitignored
- Additive, bounded, reversible, fail-soft
- Language-independent, explicit metadata outranks inferred
- No auto-relationship via LLM
