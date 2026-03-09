---
title: Temporary note lifecycle and consolidation defaults
tags:
  - design
  - lifecycle
  - temporary-notes
  - consolidation
  - plans
lifecycle: permanent
createdAt: '2026-03-09T09:07:22.778Z'
updatedAt: '2026-03-09T09:33:16.115Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Decision: temporary notes should be a first-class lifecycle concept, not a tag or folder convention. Use `lifecycle: temporary` for planning and WIP scaffolding that mainly helps during active execution, and use `lifecycle: permanent` for durable knowledge future sessions should keep.

Key decisions from the design discussion:

- Add a note field `lifecycle` with values `temporary` or `permanent`.
- Default missing or omitted lifecycle to `permanent` for backward compatibility and safer behavior.
- `update` must preserve the existing lifecycle unless lifecycle is explicitly passed.
- Tags such as `plan`, `wip`, and `completed` remain descriptive only; they do not control retention or consolidation behavior.
- Do not change folder structure for this feature; keep storage flat.
- During consolidation, explicit mode still wins. Otherwise, if all source notes are `temporary`, use delete behavior by default; mixed lifecycle sources fall back to the normal project policy/default behavior.
- A consolidated note created from temporary notes should become `permanent` by default because it represents the durable outcome after the scaffolding has served its purpose.
- The lifecycle decision rubric should be documented in `AGENT.md`, the README system prompt snippet, and the mirrored `docs/index.html` prompt snippet so MCP clients know when to choose temporary vs permanent.
- Metadata-only lifecycle migrations do not recompute embeddings. Embeddings remain derived from note title/content and are only refreshed when semantic content changes or when `reindex` is run explicitly.

Intent: temporary notes exist to support active work and should disappear cleanly once consolidated into a durable note, without overloading tags or introducing a larger storage-layout refactor.
