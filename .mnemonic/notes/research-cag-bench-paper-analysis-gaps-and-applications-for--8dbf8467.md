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
updatedAt: '2026-05-09T21:03:51.515Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: retrieval-precision-and-diversity-diagnostics-implemented-763c1459
    type: derives-from
memoryVersion: 1
---
## Research: CAG-Bench Paper Analysis for mnemonic

### Paper Summary

CAG-Bench (Canfield, Guideboard Labs, May 2026) evaluates three context strategies over 30 sequential interdependent software tasks: RAG (source-only retrieval), DAG (fixed workflow + retrieval), and CAG (Context Accumulation Generation — validated project decisions written to persistent memory and reused on subsequent tasks). On qwen2.5-coder:7b, CAG composite 48.5 vs RAG 29.6 vs DAG 28.5. Continuity recall 54.2% vs 17.1%/17.0%.

**Key architectural elements:**

- 30 sequential tasks with explicit inter-dependencies via continuity\_terms
- Per-task promote\_summary/promote\_terms enter durable memory from ground truth (never model output)
- Scoring via concept groups: checklist\_terms, source\_evidence\_terms, domain\_rule\_terms, continuity\_recall
- Four metrics: memory\_recall (coverage), memory\_precision (relevance), continuity\_recall (answer coverage), memory\_usage\_rate (uptake — retrieved concepts appearing in final answer)

**Memory selection variants:**

- cag (base): unbounded dump, cap=25 — 100% recall, 39.3% precision, 48.4% usage
- cag\_scoped (label-informed): K=5 using continuity\_terms in scoring — 80.7% recall, 53.0% precision, 54.1% usage
- cag\_scoped\_promptonly (deployable): K=5 using only task title/prompt/tags/docs — 60.9% recall, 47.7% precision, 54.0% usage
- cag\_oracle\_memory (ceiling): K=5 filtered to rows where promoted\_terms overlap continuity\_terms — 80.7% recall, 53.0% precision, 54.2% usage

### Scale: Not One Data Point

Mnemonic currently holds 106 notes. This is ONE data point. Users will have vaults from 10 to 500+ notes. Any design assuming one vault size is wrong. Vault-size-sensitive behavior is needed:

- Vault below 30 notes: dump-everything (limit = vaultSize) makes sense
- Vault 30-100 notes: scoped K=5-10 with good scoring works well
- Vault 500+ notes: strict K=3-5, precision-dominant retrieval is necessary

Mnemonic already operates in scoped-retrieval for any vault above 25 notes. The key question: does semantic+lexical+graph+canonical scoring match label-informed retrieval quality? The paper shows scoped label-free (60.9% recall) trails scoped label-informed (80.7%). Mnemonic has no labels — this is the relevant comparison.

### What the Shallow 7-Phase Plan Gets Wrong

**Already done:**

- Phase 2 (active working set) — `project_memory_summary` provides themes, anchors, orientation with primaryEntry and suggestedNext, plus working state recovery hints
- Phase 3 (diversity-aware recall) — Graph spreading activation provides discovery diversity. Canonical promotion uses structural signals over wording
- Phase 4 (constitution notes) — `alwaysLoad: true` already exists as explicit-only anchor mechanism
- Phase 5 (working-state lifecycle) — temporary/permanent lifecycle with consolidation for stable outcomes
- Phase 6 (context-shaping) — Projections exist as gitignored derived representations. `project_memory_summary` IS the orientation projection

**Structurally impossible:**

- Phase 1 (memory-uptake diagnostics) — `memory_usage_rate` requires comparing retrieval content against final agent output. Mnemonic is an MCP server — it provides retrieval but NEVER observes downstream response. Uptake is inherently client-side

**Aspirational only:**

- Phase 7 (dynamic loading) — Already planned and correctly deferred pending proven need

### Five Genuine Gaps

#### Gap 1: No Memory Validation Gate

The paper uses grounded memory (promote\_summary from task definitions, never model output). PersistBench findings: median 53% cross-domain memory leakage, 97% memory-induced sycophancy when model-generated memories are stored without validation.

Mnemonic has no validation gate. The agent calls `remember` with whatever content it produces. A hallucinated architectural decision becomes trusted memory indistinguishable from correct facts. The paper's grounding contract deliberately isolates retrieval/uptake from memory-formation errors — this is structurally absent in mnemonic.

**Actionable?** Not easily. Adding validation requires human review (kills usability), LLM-as-judge validation (conflicts with local-first, adds latency), or contradiction detection against existing memory (detectable but hard — needs semantic comparison beyond lexical matching).

**Recommendation:** Do not add a validation gate. Acknowledge this as a known risk and surface provenance/confidence as partial mitigations. This is already happening via confidence scoring on recall results.

#### Gap 2: No Retrieval Precision Measurement

The paper measures recall and precision against ground-truth continuity\_terms. Mnemonic has no ground truth — it cannot compute what fraction of truly relevant concepts a recall missed.

The existing `retrievalEvidence` on recall results (channels, rankBand, freshness, superseded) explains HOW a result was retrieved, not WHETHER it should have been. It is a retrieval-rationale signal, not a retrieval-quality signal.

**Actionable?** Partially. Mnemonic can compute from existing metadata:

- Diversity metrics: theme count, role mix, lifecycle mix in each result set
- Coverage vs vault size: results returned relative to total vault notes
- Anchor coverage: what fraction of vault anchors or alwaysLoad notes appeared in results

True precision/recall against relevance requires a relevance model mnemonic does not and should not have.

#### Gap 3: Scale-Adaptive Retrieval

The paper shows optimal strategy depends on store size. Mnemonic's `recall` has fixed `limit` (default 5, max 20) regardless of vault size. A user with 10 notes gets the same default as a user with 1000 notes.

**Actionable?** Yes. A heuristic:

- Vault below 30 notes: default limit = min(vaultSize, 20) — show everything
- Vault 30-100 notes: keep current default (5-10)
- Vault above 100 notes: tighten limit or surface a vault-size hint

Pure parameter adjustment. No new infrastructure.

#### Gap 4: Token Efficiency Metrics Missing

The paper introduces `continuity_per_memory_token` — output quality per token of context spent. Mnemonic structured output has provenance, confidence, evidence, and relationships — but no efficiency ratio or context to let agents compute their own.

**Actionable?** Yes, trivial additions to structured `RecallResult`:

- `vaultSize`: total notes in visible vaults
- The agent computes its own efficiency ratio from `results.length` vs `vaultSize`

Both values derivable from data already in the pipeline.

#### Gap 5: Uptake Problem Is Not the Server's Responsibility

The paper's central finding: even with 100% recall, models use only 38-63% of retrieved concepts. The uptake gap (-47 points) dwarfs the retrieval gap (-19.8 points).

This is a model/client problem. Mnemonic's job is retrieval and orientation. Making the model use retrieved content is the agent's responsibility.

Mnemonic CAN help indirectly:

- Better precision = less noise = higher uptake (done: canonical, graph, project bias)
- Clearer orientation = less context overload (done: `project_memory_summary`)
- Diversity-aware selection = fewer redundant results = less attention dilution (not yet done)

Direct uptake measurement requires observing the agent output. A MCP server cannot do this.

### What the Paper Confirms Mnemonic Does Right

1. **File-first embedding-driven storage is correct.** Persistent memory beats source-only retrieval. Mnemonic's one .md file per note, local embeddings, no database architecture is validated.

2. **Project bias is essential.** Domain rule recall (CAG 56.4% vs RAG 47.2%) shows project-specific constraints carried in accumulated memory improve output. Mnemonic's project boost and project-scoped storage are the right pattern.

3. **Rich metadata plausibly improves ranking quality.** The label-informed vs label-free retrieval gap validates the *value of additional retrieval signals*. Mnemonic's provenance/confidence/centrality metadata may help close this gap without requiring answer-key leakage. The paper does not directly validate provenance or confidence signals — it validates that additional signals improve retrieval, and mnemonic's metadata stack is a plausible candidate for closing the gap that label-free retrieval leaves open.

4. **Orientation-first workflow is validated.** The three-phase breakdown (T01-T10, T11-T20, T21-T30) shows orientation matters most when the concept space is large. `project_memory_summary` with primaryEntry and suggestedNext is the right entry point.

5. **Token discipline matters.** Focused K=5 selection can outperform cap=25 dumps in answer quality per token. Mnemonic's `limit` parameter and bounded relationship expansion (max 3 shown) are correct constraints.

6. **Mnemonic is already closer to the deployable retriever, not the oracle.** The paper's `cag_scoped_promptonly` uses only task title, prompt, tags, source documents, and recency — no answer-key leakage. mnemonic's retrieval stack (semantic embeddings + lexical RRF + graph spreading + canonical promotion + project locality + recency + explicit metadata) is architecturally similar to this deployable variant. This is encouraging: the deployable retriever already substantially outperforms RAG/DAG (composite 42.6 vs 29.6/28.5), and the paper also found that label-free retrieval drives *higher uptake* in early and middle phases (63.2% vs 56.8% for label-informed in T01-T10) — surface-matching retrieval produces context the model naturally recognizes as connected to its current task.

### Consolidation vs Accumulation

The paper evaluates linear accumulation — every task's promoted decisions are appended to a growing store. There is no pruning, no merging, no lifecycle management. The paper implicitly assumes more accumulated memory is better, while Mnemonic's architecture is actually memory evolution. Those are fundamentally different models.

The paper's degradation curve (base CAG usage rate dropping from 62.6% to 38.1% across three phases) may partially emerge from: duplicated concepts, unresolved historical branches, stale decisions, and accumulation without canonicalization.

Mnemonic's temporary/permanent lifecycle plus consolidation (`supersedes` and `delete` strategies), canonical promotion in recall ranking, and explicit metadata may directly attack the degradation mechanism itself, not merely retrieval quality. This is a materially different architectural hypothesis.

This is currently untested and may represent mnemonic's strongest architectural advantage relative to naive accumulation systems.

The paper evaluates linear accumulation — every task's promoted decisions are appended to a growing store. There is no pruning, no merging, no lifecycle management. Mnemonic's temporary/permanent lifecycle plus consolidation (`supersedes` and `delete` strategies) may directly counter the late-phase degradation observed in CAG-Bench, where base CAG's usage rate drops from 62.6% to 38.1% across three phases. Consolidation reduces redundancy, canonicalizes decisions, and keeps the active memory store focused. This is currently untested and may represent mnemonic's strongest architectural advantage relative to naive accumulation systems.

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

### Design Constraints That Must Hold

- No database, daemon, or always-on service (stdio MCP only)
- One file per note (never aggregate)
- Embeddings gitignored (always recomputable)
- Additive, bounded, reversible (new features fail-soft)
- Language-independent (structural signals over wording)
- No auto-relationship via LLM (explicit edges only)
- Metadata-only changes do not re-embed (projection staleness by timestamp)
- Explicit metadata outranks inferred (no heuristic write-back)

### Verdict

The shallow analysis was directionally correct (memory uptake beats retrieval breadth) but over-engineered. Several phases already exist, one is structurally impossible at the MCP server level, and others are aspirational conventions.

The right next step is 2-3 concrete, low-risk additions to recall structured output (diversity metrics, vault-size context, retrievalCoverage) plus one medium-investment feature (diversity-aware selection). Everything else is deferred.

The paper's most important lesson for mnemonic is NOT about retrieval quality. It is that the retrieval system can be excellent and the model still won't use what was retrieved. Since mnemonic can't fix uptake directly, its job is to make retrieval output as useful, precise, and diverse as possible so the agent has the best chance of incorporating it into its answer.

**Framing mnemonic's role:** mnemonic is not a memory-usage system. mnemonic is a memory-shaping system. The practical consequence:

Improve: retrieval precision, retrieval diversity, orientation quality, context shaping, token efficiency.
Do not attempt: uptake enforcement, hidden validation layers, opaque memory arbitration, server-side behavioral measurement.

**Layer separation:** mnemonic's architecture naturally separates concerns:

- mnemonic shapes and retrieves memory
- the consuming agent decides what to use
- humans remain the ultimate validation authority

Attempting to collapse these layers into the MCP server would violate the project's simplicity, local-first, and fail-soft constraints.

This layer separation explains:

- why server-side uptake metrics are impossible (mnemonic never sees the agent's output)
- why validation gates are problematic (collapsing human authority into an automated layer)
- why explicit metadata matters (the shaping layer communicates via metadata, not behavioral intervention)
- why local-first still works (each layer can operate independently)

The shallow analysis was directionally correct (memory uptake beats retrieval breadth) but over-engineered. Several phases already exist, one is structurally impossible at the MCP server level, and others are aspirational conventions.

The right next step is 2-3 concrete, low-risk additions to recall structured output (diversity metrics, vault-size context, retrievalCoverage) plus one medium-investment feature (diversity-aware selection). Everything else is deferred.

The paper's most important lesson for mnemonic is NOT about retrieval quality. It is that the retrieval system can be excellent and the model still won't use what was retrieved. Since mnemonic can't fix uptake directly, its job is to make retrieval output as useful, precise, and diverse as possible so the agent has the best chance of incorporating it into its answer.

**Framing mnemonic's role:** mnemonic is not a memory-usage system. mnemonic is a memory-shaping system. The practical consequence:

Improve: retrieval precision, retrieval diversity, orientation quality, context shaping, token efficiency.
Do not attempt: uptake enforcement, hidden validation layers, opaque memory arbitration, server-side behavioral measurement.
