---
title: 'Apply: configurable document chunk size shipped'
tags:
  - workflow
  - apply
lifecycle: temporary
createdAt: '2026-08-15T11:16:26.848Z'
updatedAt: '2026-08-15T11:16:26.848Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Implemented plan `plan-configurable-document-chunk-size-for-embedding-models-9c9a7224`. Work commit `7179557` on branch `feat/embed-max-chunk-chars` (off main): 7 files, +235/-91 — src/markdown-chunker.ts, tests/markdown-chunker.unit.test.ts, README.md, AGENT.md, ARCHITECTURE.md, docs/index.html, CHANGELOG.md.

## Evidence (run during implementation)

- Command: `npm run typecheck` — pass (src + tests)
- Command: `npm run lint` / `npm run format:check` — pass
- Command: `npm test` — pass: 86 files, 1476 tests; chunker suite 33 (22 existing + 11 new)
- Runtime smoke via build: default env → chunkerVersion "2"; EMBED_MAX_CHUNK_CHARS=8000 → "2:8000", 454-char doc single chunk; EMBED_MAX_CHUNK_CHARS=999999999 → EmbeddingConfigurationError "must be an integer between 200 and 100000" at startup
- MCP schema contract snapshots untouched (C4)

## Constraint status

- C1 pass: default version stays "2" (tests + smoke); no generation invalidation at default
- C2 pass: non-default ceiling encoded as `2:<chars>` in chunkerVersion; compared by isGenerationCurrent (src/document-sync.ts) and lazy-load manifest check (src/document-lazy-load.ts)
- C3 pass: resolveMaxChunkChars throws EmbeddingConfigurationError with range + offending value
- C4 pass: no tool schema changes; snapshots byte-identical
- C5 pass: README paragraph + env table, AGENT.md table, ARCHITECTURE.md module row, docs/index.html paragraph + config table, CHANGELOG [Unreleased] Added
- C6 pass: OLLAMA_URL guard untouched; README documents openai-compatible for remote serving
- C7 pass: full suite green

## Deviations and observations

- Pre-existing gap observed, NOT fixed (out of scope per C1): in markdown-chunker the pre-heading intro branch emits one unsplittable chunk when a document has headings and intro text exceeds the ceiling; fixing changes default chunk output and requires a chunkerVersion bump ("3"), deliberately deferred.
- Workflow hygiene: initial memory artifacts were mis-routed to the main vault (MCP calls lacked `cwd`) and memory commits landed on protected `main` with allowProtectedBranch overrides; repaired via move_memory and by relocating the 5 memory commits to branch `memory/qwen3-embedding-chunk-size` (main reset to origin/main d337c47). Remaining memory ops commit on the memory branch; work commit lives on `feat/embed-max-chunk-chars`.
