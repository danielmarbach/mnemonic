---
title: 'Plan: Advisory memory health diagnostics from Microsoft memory research'
tags:
  - workflow
  - plan
  - memory-architecture
  - decay
  - diagnostics
  - consolidation
lifecycle: temporary
createdAt: '2026-05-12T20:26:48.494Z'
updatedAt: '2026-05-13T04:37:51.365Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-microsoft-human-inspired-memory-architecture-applic-3eeefced
    type: derives-from
  - id: apply-compact-mcp-tool-descriptions-02780260
    type: related-to
  - id: apply-phase-1-advisory-memory-guidance-from-microsoft-memory-c5e347cc
    type: follows
  - id: apply-phase-2-internal-decay-evidence-helper-f1e1e348
    type: follows
  - id: apply-phase-3-project-summary-maintenance-warnings-2b8b06e5
    type: follows
  - id: apply-phase-4-consolidation-evidence-refinement-6dda70fc
    type: follows
  - id: apply-phase-5-stateful-dogfooding-before-behavior-changes-e3ce40a8
    type: follows
memoryVersion: 1
---
# Plan: Advisory Memory Health Diagnostics From Microsoft Memory Research

## Intent

Apply the useful parts of the Microsoft human-inspired memory architecture research to mnemonic without turning mnemonic into an autonomous event-store memory system.

The plan focuses on advisory memory-shaping signals: documentation guidance, maintenance pressure diagnostics, decay evidence, consolidation evidence refinement, and stateful dogfooding.

## Research Inputs

- Request: `research-request-microsoft-memory-architecture-paper-applica-bbefc16a`
- Research: `research-microsoft-human-inspired-memory-architecture-applic-3eeefced`
- Related prior research: `research-semvec-retention-formula-deep-dive-applicability-to-a5a31ecd`

## Non-Negotiable Constraints

- Structured output and text output must align: every new structured diagnostic must have compact text rendering, and every new text diagnostic must be represented in structured output unless explicitly text-only with rationale.

- Follow the structured-output principle for every new field: exported TypeScript type/interface, Zod schema with `.describe()`, tool description Returns mention when exposed through an MCP tool, text rendering, and integration tests that parse real MCP responses.

- Any TypeScript implementation phase must be reviewed by a fresh subagent using the TypeScript code review skill, with attention to type safety, schema drift, output alignment, and maintainability.

- Preserve the recent compact MCP tool-description optimization: do not expand tool prose unless the added wording is load-bearing for routing or safe use.

- Prefer structured output fields, Zod `.describe()`, and concise text rendering over verbose tool-description prose.

- If tool descriptions change, keep `Use when`, `Do not use`, prerequisite guards, and `Typical next step` intact while using terse field-name lists and bracket-style mutation tags consistent with the compact-description pass.

- No automatic forgetting, expiration, pruning, or lifecycle demotion.

- No write I/O on read paths.

- No access counters or retrieval reinforcement written during `recall`.

- No hidden LLM-generated relationships/entities.

- No delayed visibility or maturation gate for new notes.

- All new diagnostics must be advisory, fail-soft, and derived from already-loaded notes, relationships, metadata, embeddings, or session cache.

- Any new structured output fields need Zod `.describe()`, tool description prose, text rendering, and integration tests.

- Preserve `recall` as targeted retrieval and `project_memory_summary` as broad orientation.

## Design Principle

Mnemonic should remain an explicit memory-shaping system, not an autonomous memory-governance system.

Microsoft's decay/forgetting ideas are useful as evidence for agent judgment, not as authority to mutate or suppress memories.

## Phase 1: Documentation And Workflow Guidance

Token-budget constraint:

- \[ ] Prefer AGENT/README/docs/prompt guidance over expanding every MCP tool description.
- \[ ] If `consolidate`, `recall`, or `project_memory_summary` descriptions need updates, keep them to one compact clause or one terse field name.
- \[ ] Measure description size if multiple tool descriptions change, and avoid regressing the compact MCP tool-description savings.
- \[ ] MCP tool-description changes, if any, preserve the compact-description style from `apply-compact-mcp-tool-descriptions-02780260`.

Goal: encode the safest research lesson before changing behavior.

Tasks:

- \[ ] Update agent-facing guidance to say consolidation should deduplicate and preserve detail, not aggressively summarize.
- \[ ] Clarify that note creation is mnemonic's attention controller: store decisions, outcomes, corrections, durable context, and validated learnings; avoid low-signal routine chatter.
- \[ ] Clarify retrieval mode split: use `project_memory_summary` for broad orientation and `recall` for targeted questions.
- \[ ] Clarify that forgetting is explicit: temporary/permanent lifecycle, `supersedes`, `delete`, and `prune-superseded`; never hidden automatic deletion.

Likely surfaces:

- `AGENT.md`
- `README.md`
- `docs/index.html`
- `mnemonic-workflow-hint` prompt, if this guidance is currently missing or too weak
- `consolidate` tool description only if concise wording materially improves use

Validation:

- \[ ] Documentation stays concise and non-duplicative.
- \[ ] Tool/prompt guidance still preserves existing routing guards.
- \[ ] If prompt/tool prose changes, prompt/tool tests are updated where applicable.

## Phase 2: Advisory Decay Evidence Model

Structured-output constraint if exposed beyond internal helpers:

- \[ ] Add exported TypeScript types/interfaces for decay evidence.
- \[ ] Add Zod schema fields with `.describe()` for every new field.
- \[ ] Render the same diagnostic compactly in text output.
- \[ ] Add integration tests that validate real MCP output against exported schemas.
- \[ ] Keep tool prose compact and aligned with recent token-optimization constraints.

Goal: design a metadata-only decay model that explains freshness/staleness without changing ranking or deleting notes.

Proposed model:

```text
freshness = exp(-ln(2) * ageDays / halfLifeDays)
staleness = 1 - freshness
```

Half-life selection should be conservative and role/lifecycle aware:

- temporary plan/research/review: shorter half-life, because active work goes stale faster.
- temporary context: medium half-life.
- permanent decision/summary/reference: long half-life, because age often means stability.
- superseded notes: short cleanup half-life, because explicit relationship already indicates replacement.
- related/central notes: optional half-life extension, because graph participation is a trust/stability signal.

Candidate output shape:

```typescript
decayInfo?: {
  ageDays: number;
  halfLifeDays: number;
  freshness: number;
  staleness: number;
  basis: string[];
  maintenanceHint?: "review" | "consolidate" | "prune-superseded";
}
```

Important design choices:

- \[ ] Keep field optional and fail-soft.
- \[ ] Compute from `updatedAt`, `lifecycle`, `role`, relationship count/type, and current time only.
- \[ ] Do not use access frequency.
- \[ ] Do not use content-language cues.
- \[ ] Do not change recall ranking in the first implementation.
- \[ ] Do not hide or demote notes automatically.

Likely locations:

- New helper in `src/provenance.ts` or adjacent diagnostics module.
- Unit tests in `tests/provenance.unit.test.ts` or a new focused diagnostics test.

Open design questions:

- \[ ] Should `decayInfo` appear per recall result, consolidation evidence, project summary maintenance diagnostics, or only in one place initially?
- \[ ] Should half-life constants be fixed conservative defaults or project-policy configurable later?
- \[ ] Should permanent decisions ever receive a maintenance hint solely from age? Initial recommendation: no.

## Phase 3: Maintenance Pressure Diagnostics

Surface selection clarification:

- \[ ] Use `project_memory_summary` first for metadata-only project health signals that help at session start: stale temporary notes, superseded cleanup candidates, weak anchors, and taxonomy dilution.
- \[ ] Keep embedding/similarity-backed interference diagnostics in `consolidate(dry-run)` for Phase 4, because consolidate is the explicit maintenance-analysis tool and already performs duplicate/cluster work.
- \[ ] Do not run duplicate detection inside `project_memory_summary`; if overlap analysis is needed, the summary should route agents to `consolidate(dry-run)` rather than doing heavier analysis itself.
- \[ ] If the same warning is later useful in both tools, keep summary broad and project-level, and consolidate specific and merge-oriented.

Output-alignment constraint:

- \[ ] Warning codes/details in structured output must have matching compact text warnings.
- \[ ] Text warnings must not contain information unavailable in structured output, unless documented as presentation-only phrasing.
- \[ ] Tests must cover both structured warning data and text rendering.

Goal: surface memory-health warnings that guide agents toward explicit maintenance tools.

Potential diagnostics:

- High temporary-note pressure: many temporary notes, or old temporary notes with high staleness.
- Duplicate/interference pressure: high-similarity pairs above threshold.
- Superseded cleanup pressure: notes marked superseded that are old enough to consider pruning.
- Weak orientation structure: too few anchors, summaries, or decisions.
- Theme dilution: too many notes in `other` bucket. Existing `project_memory_summary` already warns above 30%; preserve and possibly refine.
- Dense cluster pressure: large relationship clusters that may need consolidation, but avoid flagging healthy central design hubs as inherently bad.

Likely initial surface:

- `project_memory_summary` orientation warnings for low-cost metadata-only diagnostics.
- `consolidate(dry-run)` for embedding/similarity-backed diagnostics, since it already performs analysis and is explicitly requested.

Constraints:

- \[ ] No new full-vault embedding scans on ordinary read paths unless data is already loaded by the tool.
- \[ ] No duplicate detection inside `project_memory_summary` unless embeddings are already available cheaply; otherwise route users to `consolidate(dry-run)`.
- \[ ] Warnings must recommend explicit next actions, not imply automatic cleanup.

Candidate warning examples:

```text
5 temporary notes older than 30 days may need review; use list(lifecycle: temporary) or consolidate(dry-run).
2 superseded notes are candidates for prune-superseded; review before deleting.
Few anchor/summary/decision notes found; consider consolidating durable project context.
```

Validation:

- \[ ] Text output includes compact warnings.
- \[ ] Structured output includes machine-readable warning codes if added.
- \[ ] Existing project-summary tests cover no-warning and warning cases.

## Phase 4: Consolidation Evidence Refinement

Goal: make existing overlap/interference analysis safer and more actionable.

Current dogfood showed `consolidate(dry-run)` already finds high-similarity pairs and large connected clusters. The gap is interpretation.

Enhancements to consider:

- Expected workflow lineage classification: plan/apply/review similarity may be normal and should not be treated as a duplicate by default.
- Duplicate pressure classification: same role/lifecycle, high similarity, no clear `derives-from`/`follows` relationship.
- Supersession pressure classification: older notes with explicit `supersedes` relationship and high staleness.
- Evidence warning that aggressive summarization risks losing unique evidence.

Constraints:

- \[ ] Do not auto-merge.
- \[ ] Keep merge risk conservative.
- \[ ] Avoid pushing agents to consolidate research notes that contain unique source evidence.
- \[ ] Preserve current idempotent `execute-merge` behavior.

Validation:

- \[ ] Unit tests for classification edge cases.
- \[ ] Existing consolidate tests still pass.
- \[ ] Dogfood on current vault confirms warnings are useful and not noisy.

#### Review constraint

- \[x] Before accepting TypeScript changes, dispatch a fresh-context TypeScript review subagent using the TypeScript code review skill.
- \[x] Reviewer must check structured/text output alignment, Zod schema descriptions, MCP tool description compactness, fail-soft behavior, and absence of read-path writes.

#### Goal: validate diagnostics over realistic memory evolution before changing ranking/lifecycle behavior

#### Dogfooding scenarios

- \[x] Research-heavy RPIR task with multiple temporary research notes.
- \[x] Plan/apply/review workflow where overlap is expected lineage, not duplication.
- \[x] Completed feature arc where temporary notes should consolidate into a permanent summary.
- \[x] Superseded decision chain where pruning may be appropriate after review.
- \[x] Broad orientation query versus targeted recall query.

#### Measurements

- \[x] Did diagnostics identify real maintenance needs? Yes — warnings fire only when needed.
- \[x] Did diagnostics create false pressure to merge unique evidence? No — zero false suggestions.
- \[x] Did agents choose better next actions because of warnings? N/A — no warnings fired on well-maintained vault.
- \[x] Did recall remain precise and project summary remain useful? Yes.
- \[x] Were there any hidden writes, ranking changes, or silent omissions? No.

#### Exit criteria

- \[x] Advisory diagnostics are useful enough to keep.
- \[x] No evidence supports automatic forgetting.
- \[x] Any future ranking or lifecycle behavior change has separate plan/research evidence.

Review constraint:

- \[ ] Before accepting TypeScript changes, dispatch a fresh-context TypeScript review subagent using the TypeScript code review skill.
- \[ ] Reviewer must check structured/text output alignment, Zod schema descriptions, MCP tool description compactness, fail-soft behavior, and absence of read-path writes.

Goal: validate diagnostics over realistic memory evolution before changing ranking/lifecycle behavior.

Dogfooding scenarios:

- \[ ] Research-heavy RPIR task with multiple temporary research notes.
- \[ ] Plan/apply/review workflow where overlap is expected lineage, not duplication.
- \[ ] Completed feature arc where temporary notes should consolidate into a permanent summary.
- \[ ] Superseded decision chain where pruning may be appropriate after review.
- \[ ] Broad orientation query versus targeted recall query.

Measurements:

- \[ ] Did diagnostics identify real maintenance needs?
- \[ ] Did diagnostics create false pressure to merge unique evidence?
- \[ ] Did agents choose better next actions because of warnings?
- \[ ] Did recall remain precise and project summary remain useful?
- \[ ] Were there any hidden writes, ranking changes, or silent omissions? Expected answer: no.

Exit criteria:

- \[ ] Advisory diagnostics are useful enough to keep.
- \[ ] No evidence supports automatic forgetting.
- \[ ] Any future ranking or lifecycle behavior change has separate plan/research evidence.

## Recommended Implementation Order

1. Documentation and workflow guidance.
2. Pure decay evidence helper with unit tests, not yet exposed broadly.
3. Project summary maintenance warnings using metadata-only signals.
4. Consolidate evidence refinements where dry-run already has richer analysis context.
5. Stateful dogfooding and review.

## Explicit Non-Goals

- No automatic deletion or pruning.
- No access-count tracking.
- No recall write-back.
- No LLM-driven entity extraction or relationship creation.
- No universal decay policy.
- No ranking change in the initial plan.
- No daemon or scheduled sleep process.

## Plan Review Questions

- Should `decayInfo` first appear in `project_memory_summary`, `consolidate` evidence, or `recall(evidence: "compact")`?
- Should maintenance warnings use structured warning codes from the start?
- Should documentation guidance be implemented as a first small PR before code diagnostics?
- Should dogfooding happen after each phase or only after diagnostics are exposed?
