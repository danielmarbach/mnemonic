---
title: 'Review: EMBED_MAX_CHUNK_CHARS adversarial review passed'
tags:
  - workflow
  - review
  - embeddings
  - chunking
lifecycle: temporary
createdAt: '2026-08-15T11:31:44.441Z'
updatedAt: '2026-08-15T11:31:44.441Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Fresh-context adversarial review of work commit `7179557` (branch `feat/embed-max-chunk-chars`), run in isolated worktree at the branch tip. Reviewer had no prior exposure to implementation decisions.

## Outcome: continue

## Constraint checklist

| Constraint | Status | Evidence |
| --- | --- | --- |
| C1 Default byte-identical | pass | `resolveMaxChunkChars` returns 4000 unset/empty; `chunkerVersionFor(4000)` → `"2"`; differential run of parent vs new chunker at default env over 419 docs (19 edge cases + 400 fuzz) → 0 mismatches / 2161 chunks byte-identical, both versions `"2"` |
| C2 Non-default invalidates | pass | version `2:<chars>` consumed by `isGenerationCurrent` (src/document-sync.ts:98, invoked :381) and lazy-load manifest check (src/document-lazy-load.ts:291); `embeddingCompatibilityIdentity` also embeds it (src/document-source-index.ts:104) |
| C3 Fail-fast invalid env | pass | throws `EmbeddingConfigurationError` with range + raw value at module load; smoke `EMBED_MAX_CHUNK_CHARS=199` → rejected, no version printed |
| C4 No MCP schema changes | pass | schema snapshot sha256 identical at parent and HEAD (`d9fb44f7…79ebc04d`) |
| C5 Docs synchronized | pass | README paragraph + env row, AGENT.md table, ARCHITECTURE.md chunker row, docs/index.html paragraph + row, CHANGELOG [Unreleased]; doc claims verified against code (1200-char projections, OLLAMA_URL guard) |
| C6 OLLAMA_URL guard unchanged | pass | `git diff` on src/embeddings.ts empty; guard intact at :118-129 |
| C7 typecheck/lint/test green | pass | fresh runs below |

## Verification evidence (fresh, run in review)

- Command: `npm run typecheck` / Result: pass / exit 0 (src + tests)
- Command: `npm run lint` / Result: pass / exit 0
- Command: `npm test` / Result: pass / 86 files, 1476 tests, 0 failures (63.65s)
- Command: `npm run build:fast` + runtime smoke / Result: pass / default `2`; `EMBED_MAX_CHUNK_CHARS=8000` → `2:8000`; `=199` → rejected EmbeddingConfigurationError
- Command: differential chunker old-vs-new over 419-doc corpus / Result: pass / mismatches=0, totalChunks=2161

## Findings (all non-blocking notes)

1. Intro-before-first-heading branch emits one unsplittable chunk gated only by MIN_CHUNK_CHARS — can exceed a small custom ceiling. Pre-existing at default (C1 requires unchanged); deferred deliberately, fix would bump default version to "3".
2. `Number()` coercion accepts `" 4000"`/`"4e3"` → same resolved value → same version string; no invalidation hazard; garbage throws.
3. Doc nit: README env-table Default column says `unset` vs `4000` elsewhere — same semantics, cosmetic.
4. Eager module-load validation also aborts non-embedding CLI paths on invalid env — consistent with existing OLLAMA_URL pattern.

Regression hunt: deriveChunkId shapes unchanged (IDs byte-identical under fuzz incl. duplicate/inline-code headings), splitOrdinal continuity asserted, intro MIN_CHUNK_CHARS gate preserved, heading ancestry stack untouched; const→parameter refactor is the only textual delta in split logic.

Recommendation: continue — proceed to consolidation; the four notes ride along in the consolidation note.
