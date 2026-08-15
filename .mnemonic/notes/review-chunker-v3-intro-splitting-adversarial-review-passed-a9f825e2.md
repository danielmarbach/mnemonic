---
title: 'Review: chunker v3 intro splitting adversarial review passed'
tags:
  - workflow
  - review
  - embeddings
  - chunking
lifecycle: temporary
createdAt: '2026-08-15T11:47:32.290Z'
updatedAt: '2026-08-15T11:47:48.804Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: apply-configurable-document-chunk-size-shipped-a105b8ab
    type: derives-from
memoryVersion: 1
---
Fresh-context adversarial review of work commit `6ad14e7` (Split oversized intros against the chunk ceiling, chunker v3) in isolated worktree `/tmp/mnemonic-review-v3`. Reviewer had no prior exposure to implementation decisions. Follows the user-endorsed scope change ("I'm ok to bump the chunker version") captured as plan step 5 / constraint C8.

## Outcome: continue

## Constraint checklist

| Constraint | Status | Evidence |
| --- | --- | --- |
| C8a version `"3"` default / `"3:<chars>"` custom | pass | `chunkerVersionFor` src/markdown-chunker.ts:42-44, wired :164; smoke default `3`, `EMBED_MAX_CHUNK_CHARS=8000` `3:8000` |
| C8b intro routes through splitOversizedContent behind MIN_CHUNK_CHARS | pass | gate at :200-203; tiny intro smoke 0 chunks; sub-ceiling intro single chunk, chunkId `${documentId}::::0::0`, splitOrdinal 0, field-level diff old-vs-new = 0; differential: only intros exceeding ceiling change (140/614 docs, all with old intro > 4000) |
| C8c no other splitting behavior changed | pass | diff 7179557..6ad14e7 exactly two hunks (version + intro branch); refined differential 614 docs: diffUnexpected=0, nonIntroChanged=0, textLoss=0 |
| C8d no stale `"2"` assertions; CHANGELOG Changed entry | pass | rg over tests/src/scripts/docs/skills clean; cross-suite references use live `markdownChunker.chunkerVersion`; CHANGELOG [Unreleased] Changed present |
| C8e gates green, snapshots untouched | pass | typecheck/lint/format/test exit 0; 86 files, 1479 tests (+3 intro tests); snapshot sha256 identical at parent and commit (`d9fb44f7…79ebc04d`, same as prior review) |

## Verification evidence (fresh, run in review)

- Command: `npm run typecheck` / Result: pass / exit 0
- Command: `npm run lint` / Result: pass / exit 0
- Command: `npm run format:check` / Result: pass / exit 0
- Command: `npm test` / Result: pass / 86 files, 1479 tests, 0 failures (64.77s)
- Command: `npm run build:fast` + smokes / Result: pass / default `3`; custom `3:8000`; oversized intro 2500+2500 → 2 chunks; tiny intro → 0 chunks
- Command: differential old (7179557, esbuild-bundled) vs new (6ad14e7) over 614 docs / Result: pass / diffAllowed(oversizedIntroOnly)=140, diffUnexpected=0, nonIntroChanged=0, textLoss=0

## Findings (none blocking)

1. No-op ternary at src/markdown-chunker.ts:115 (`excerpt.length > 0 ? excerpt : content.slice(0, 200).trim()` — both branches identical); pre-existing, cosmetic, future cleanup.
2. A single paragraph longer than the ceiling still yields one over-ceiling chunk — intended paragraph-granularity semantics, matches section behavior since v1 and existing tests.
3. 3+ consecutive newlines normalize to `\n\n` when an oversized intro is split — same normalization sections always had; sub-ceiling intros byte-identical.

Recommendation: continue — proceed to consolidation. Single-paragraph over-ceiling chunks and the ternary cleanup are recorded as known non-blocking notes.
