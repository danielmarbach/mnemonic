---
title: 'mnemonic — role suggestions: language-independent read-only runtime hints'
tags:
  - roles
  - heuristics
  - language-independence
  - design
  - inference
  - decision
lifecycle: permanent
createdAt: '2026-09-27T20:54:38.579Z'
updatedAt: '2026-09-27T20:54:38.579Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mcp-workflow-ux-hint-prompt-tool-descriptions-and-session-st-e89a18fc
    type: related-to
  - id: enrichment-layer-design-provenance-temporal-recall-projectio-7af26f06
    type: explains
  - id: enrichment-layer-design-provenance-temporal-recall-projectio-7af26f06
    type: related-to
  - id: rpir-workflow-design-for-mnemonic-research-plan-implement-re-80b00851
    type: explains
memoryVersion: 1
---
## Consolidated from:
### mnemonic — language-independent role heuristics
*Source: `mnemonic-language-independent-role-heuristics-f66619c1`*

Phase 7 role suggestions prioritize language-independent structural and graph signals over wording cues.

Rationale:

- mnemonic is a general-purpose MCP and must work for mixed-language and non-English notes
- overfitting to English note titles or mnemonic-specific vocabulary would make the feature brittle and misleading
- graph shape, heading breadth, list structure, and relationship patterns generalize better than keyword spotting

Primary signals:

- relationship centrality and inbound/outbound shape
- connection diversity across visible project notes
- heading count and breadth
- ordered-list, task-list, and lookup-style structure
- baseline anchor candidacy only as a weak secondary signal

Secondary signals:

- wording cues may be used only as weak optional boosts
- wording alone must not push an ambiguous note over the threshold

Tradeoffs:

- lower recall for some thin notes with little structure
- higher precision and better cross-language behavior

Constraints:

- language-neutral structure and graph evidence remains primary
- unsupported-language notes should behave the same as cue-word variants when structure is identical
- tuning decisions must not optimize only for mnemonic's own notes

Future considerations:

- additional structural signals may improve precision later
- multilingual wording support can be added only as supplementary evidence, never as the backbone of inference

### mnemonic — role suggestions are read-only runtime hints (consolidated)
*Source: `mnemonic-role-suggestions-are-read-only-runtime-hints-consol-532d5d9b`*

Roles and importance suggestions in mnemonic are **read-only runtime hints**, not a required schema, and must never mutate notes.

## Current role/lifecycle model (concrete)

**NoteRole** (`src/storage.ts` line 9): `"summary" | "decision" | "plan" | "context" | "reference"`
**NoteLifecycle** (`src/storage.ts` line 8): `"temporary" | "permanent"`
**NoteImportance** (`src/storage.ts` line 10): `"high" | "normal" | "low"`
**RelationshipType** (`src/storage.ts` line 7): `"related-to" | "explains" | "example-of" | "supersedes"`

**Lifecycle default** (`src/index.ts` line 1924): `lifecycle ?? "permanent"` — new notes default permanent unless explicitly temporary.
**alwaysLoad default** (`src/index.ts` line 1925): `alwaysLoad ?? false`
**Scope default**: `"project"` when cwd + vault exist, `"ask"` when vault doesn't exist, `"global"` when no cwd (`src/project-memory-policy.ts`).
**Consolidation default**: `"supersedes"` unless all sources are temporary (then `"delete"`).

**Role inference signals** (`src/role-suggestions.ts`):

- summary: inboundReferences >= 4, linkedByPermanentNotes >= 2, headingCount >= 2, bulletCount >= 4
- decision: explanatoryRelations >= 2, headingCount >= 2, bulletCount >= 2, paragraphCount >= 2
- plan: numberedCount >= 2, checklistCount >= 2, totalListItems >= 4
- reference: colonPairCount >= 4, tableRowCount >= 3, shortLineCount >= 4
- context: permanent lifecycle, headingCount >= 2, paragraphCount >= 2, inbound >= 1 or totalRelations >= 1
- Threshold: ROLE_THRESHOLD = 5, ROLE_MARGIN = 2 (score >= 5 and exceeds second-best by >= 2)

**Inferred roles are never persisted**: `role-suggestions.ts` only returns suggestions at runtime; only explicit user/agent-provided values get written to frontmatter. Source can be `"explicit"`, `"suggested"`, or `"none"`.

**README discrepancy**: README lists roles as `summary, decision, plan, log, reference` — code has `"context"` not `"log"`. README says importance is `high` and `normal` only — code includes `"low"`. Code is authoritative.

## Core principle

- Inferred metadata improves prioritization when explicit frontmatter is absent
- Auto-writing inference back into note frontmatter blurs the line between user intent and system guesswork
- Keeping suggestions runtime-only avoids surprise churn in note files and prevents heuristics from silently rewriting the knowledge base

## Design constraints

- **Explicit frontmatter wins** when present — `alwaysLoad` is explicit-only and is never inferred
- Roles must stay **general-purpose across domains** (`plan`, `decision`, `summary`, etc.)
- Unknown or invalid role values are **ignored rather than rejected**
- Roles must **never gate** note loading, writing, or recall
- Effective metadata must be computed on demand and **never persisted** into notes, projections, or stored caches
- Suggested metadata should be **sparse and high-precision** rather than ubiquitous

## Tradeoffs

- The same suggestion may be recomputed repeatedly instead of being cached into notes
- Users do not get a permanent inferred label unless they explicitly add frontmatter themselves
- Weaker guidance than a strict schema, but much lower adoption friction

## Examples

- A hub note may be treated like a summary during ranking without gaining `role: summary` in frontmatter
- A strongly structured checklist may influence plan-oriented ranking without changing the markdown file
- A roadmap note may use `role: plan`; a design rationale may use `role: decision`
- A project with no roles must still orient and recall correctly

## Future considerations

- Debug output may eventually expose suggested metadata for inspection
- If users want persistence, that should happen through explicit editing rather than heuristic write-back
- Custom roles should remain ignored unless there is a clear compatibility story that preserves the hint-only model
- Proposed additions: `research` and `review` roles for first-class workflow artifact typing
