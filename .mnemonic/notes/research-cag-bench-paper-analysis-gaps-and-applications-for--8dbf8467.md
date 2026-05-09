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
updatedAt: '2026-05-09T07:44:40.177Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: request-research-cag-bench-paper-gaps-and-applications-for-m-450273ae
    type: derives-from
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

The paper introduces `continuity_per_memory_token` — output quality per token of context spent. Mnemonic structured output has provenance, confidence, evidence, and relationships on each result — but no efficiency ratio or context to let agents compute their own.

**Actionable?** Yes, trivial additions to structured `RecallResult`:

- `vaultSize`: total notes in visible vaults
- The agent computes its own efficiency ratio from `results.length` vs `vaultSize`

Both values derivable from data already in the pipeline.

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

1. **File-first embedding-driven storage is correct.** Persistent memory beats source-only retrieval. Mnemonic's one .md file per note, local embeddings, no database architecture is validated.

2. **Project bias is essential.** Domain rule recall (CAG 56.4% vs RAG 47.2%) shows project-specific constraints carried in accumulated memory improve output. Mnemonic's project boost and project-scoped storage are the right pattern.

3. **Rich metadata plausibly improves ranking quality.** The label-informed vs label-free retrieval gap validates the *value of additional retrieval signals*. Mnemonic's provenance/confidence/centrality metadata may help close this gap without requiring answer-key leakage. The paper does not directly validate provenance or confidence signals — it validates that additional signals improve retrieval, and mnemonic's metadata stack is a plausible candidate for closing the gap that label-free retrieval leaves open.

4. **Orientation-first workflow is validated.** The three-phase breakdown (T01-T10, T11-T20, T21-T30) shows orientation matters most when the concept space is large. `project_memory_summary` with primaryEntry and suggestedNext is the right entry point.

5. **Token discipline matters.** Focused K=5 selection can outperform cap=25 dumps in answer quality per token. Mnemonic's `limit` parameter and bounded relationship expansion (max 3 shown) are correct constraints.

6. **Mnemonic is already closer to the deployable retriever, not the oracle.** The paper's `cag_scoped_promptonly` uses only task title, prompt, tags, source documents, and recency — no answer-key leakage. mnemonic's retrieval stack (semantic embeddings + lexical RRF + graph spreading + canonical promotion + project locality + recency + explicit metadata) is architecturally similar to this deployable variant. This is encouraging: the deployable retriever already substantially outperforms RAG/DAG (composite 42.6 vs 29.6/28.5), and the paper also found that label-free retrieval drives *higher uptake* in early and middle phases (63.2% vs 56.8% for label-informed in T01-T10) — surface-matching retrieval produces context the model naturally recognizes as connected to its current task.

1) File-first embedding-driven storage: persistent store beats source-only
2) Project bias essential: domain rule recall 56.4% for CAG vs 47.2% for RAG — project-specific constraints carried in accumulated memory improve output
3) Rich metadata improves ranking: label-informed vs label-free gap validates mnemonic's confidence/provenance/centrality signals
4) Orientation-first workflow: Phase analysis shows orientation matters most when concept space is large
5) Token discipline: focused K=5 can outperform cap=25 dumps in quality per token

### Concrete Actions (Non-Aspirational)

**Immediate (low risk, additive, no new infrastructure):**

1. **Vault-size awareness in recall defaults** — heuristic on `limit` based on total visible vault notes count
2. **Diversity metrics in structured output** — theme/role/lifecycle mix per recall result set, all derivable from existing metadata
3. **Token-efficiency context** — include `vaultSize` in `RecallResult` so agents can compute their own efficiency ratios
4. **`retrievalCoverage` in structured output** — proportion of relevant high-priority anchors (alwaysLoad, role: summary, canonical project notes) represented in final result set. Not raw vault-wide anchor counting, which is noisy; project-local anchors matter more than global anchors, and some alwaysLoad notes are intentionally orthogonal to a query.

**Medium-term (new code but additive, fail-soft):**

1. **Diversity-aware result selection** — after ranking, pass through diversity check ensuring theme, role, and lifecycle spread. The paper shows this matters for high concept density tasks. Builds on existing theme classification and anchor scoring.
2. **Adaptive limit** — auto-adjust based on query specificity plus vault size, similar to existing temporal hint detection pattern

**Deferred:**

1. **Memory validation gate** — premature, acknowledged risk
2. **Uptake measurement** — client-side concern, could become a client benchmark like dogfooding packs, not a server feature

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

### Consolidation vs Accumulation

The paper evaluates linear accumulation — every task's promoted decisions are appended to a growing store. There is no pruning, no merging, no lifecycle management. Mnemonic's temporary/permanent lifecycle plus consolidation (`supersedes` and `delete` strategies) may directly counter the late-phase degradation observed in CAG-Bench, where base CAG's usage rate drops from 62.6% to 38.1% across three phases. Consolidation reduces redundancy, canonicalizes decisions, and keeps the active memory store focused. This is currently untested and may represent mnemonic's strongest architectural advantage relative to naive accumulation systems.

### Verdict

The shallow analysis was directionally correct (memory uptake beats retrieval breadth) but over-engineered. Several phases already exist, one is structurally impossible at the MCP server level, and others are aspirational conventions.

The right next step is 2-3 concrete, low-risk additions to recall structured output (diversity metrics, vault-size context, retrievalCoverage) plus one medium-investment feature (diversity-aware selection). Everything else is deferred.

The paper's most important lesson for mnemonic is NOT about retrieval quality. It is that the retrieval system can be excellent and the model still won't use what was retrieved. Since mnemonic can't fix uptake directly, its job is to make retrieval output as useful, precise, and diverse as possible so the agent has the best chance of incorporating it into its answer.

**Framing mnemonic's role:** mnemonic is not a memory-usage system. mnemonic is a memory-shaping system. The practical consequence:

Improve: retrieval precision, retrieval diversity, orientation quality, context shaping, token efficiency.
Do not attempt: uptake enforcement, hidden validation layers, opaque memory arbitration, server-side behavioral measurement.

The shallow analysis was directionally correct (memory uptake beats retrieval breadth) but over-engineered. Several phases already exist, one is structurally impossible at the MCP server level, and others are aspirational conventions.

The right next step is 2-3 concrete, low-risk additions to recall structured output (diversity metrics, vault-size context, anchor coverage) plus one medium-investment feature (diversity-aware selection). Everything else is deferred.

The paper's most important lesson for mnemonic is NOT about retrieval quality. It is that the retrieval system can be excellent and the model still won't use what was retrieved. Since mnemonic can't fix uptake directly, its job is to make retrieval output as useful, precise, and diverse as possible so the agent has the best chance of incorporating it into its answer.

- No database, daemon, always-on service
- One file per note, embeddings gitignored
- Additive, bounded, reversible, fail-soft
- Language-independent, explicit metadata outranks inferred
- No auto-relationship via LLM
