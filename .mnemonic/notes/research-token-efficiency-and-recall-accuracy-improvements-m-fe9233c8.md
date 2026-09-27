---
title: >-
  Research: token efficiency and recall accuracy improvements (measured
  2026-09-27)
tags:
  - research
  - token-efficiency
  - recall
  - hybrid-search
  - accuracy
  - weak-models
  - tool-surface
lifecycle: permanent
createdAt: '2026-09-27T12:00:37.780Z'
updatedAt: '2026-09-27T12:00:37.780Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Research on making mnemonic more token-efficient and more accurate, including for weaker models. Measured on 2026-09-27 against the live project vault (256 visible notes) and a fresh `build/index.js`. Work happens on branch `improve/token-efficiency-and-recall-accuracy`.

## Measurements

- `tools/list`: 145 KB (~36k tokens) for 28 tools. Output schemas 88.7 KB (61%), input schemas 32.7 KB, descriptions 17.6 KB. The `cwd` description is repeated 27 times (avg 186 chars).
- Default `recall`: ~27 KB text (~7k tokens) because `formatNote` renders full bodies, although the description promises "ranked matches (id, title, score, ...)". A 3-result identifier query returned 13 KB.
- Default `list`: 66 KB text + 109 KB structured, no default limit.
- `get` structured output is 2.4x its text; `project_memory_summary` 1.9x. Scores serialize with 16 digits. The summary lists the same related note twice (`derives-from` and `follows`).
- The server sets no MCP `instructions`; `AGENT.md` is ~40 KB and only helps when users paste it.

## Accuracy findings

- Body identifiers are unfindable. `recallScopeNoteCount` and `buildNoteWarnings` appear verbatim in anchor notes, yet no result gets a lexical rank and the notes miss the top 8. `RRF_K` (only in the DuckDB decision body) misses the top 8.
- Root cause: both embedding input (`src/helpers/embed.ts` returns `projectionText`) and the lexical channel use the projection: title + 280-char summary + tags + up to 8 headings, capped at 1200 chars (`src/projections.ts`). `normalizeText` also splits `RRF_K` into `rrf k` and `nomic-embed-text-v2-moe` into five tokens.
- Cross-project leakage: from the mnemonic repo, "no database daemon file-first" ranks NServiceBus notes #1 and #4 (key design decisions is semantic rank 34); "how does recall ranking work" ranks a DocsEngine note #1. Notes associated with another project appear not to be gated like weak unassociated globals (inferred from results, not yet confirmed in code).
- A superseded note ranked #4 while its superseder was #2.

## Proposals (priority order)

1. Retrieval eval harness first: known-item queries generated from a fixture vault (title-derived, body-window, identifier), MRR@10 and Success@1, deterministic cached embeddings for CI. This is the never-executed "Stage 0" from the DuckDB decision.
2. Body-aware retrieval: extract an uncapped identifier set (backtick spans, camelCase, snake_case, kebab-case, versions) from the full body into the projection and tokenize compounds both joined and split. Later, chunk long notes with the existing document-source chunker and score by best chunk. All derived and recoverable via sync.
3. Three-way project affinity (current / unassociated global / other project); gate other-project notes like weak globals, admit on strong lexical or exact evidence, keep lift-on-empty.
4. Collapse superseded notes when their superseder is in the same result set.
5. Recall returns summary + query-focused snippet by default, full body behind `detail: "full"`, text ends with a "`get <id>` for full text" hint.
6. `list` gets a default limit with a cursor and one line per note.
7. Tool surface: `MNEMONIC_TOOLSET=core|full` profile (core: recall, get, remember, update, relate, list, sync, project_memory_summary, consolidate); shorten repeated `cwd` and output-schema descriptions; dedupe shared persistence/retry shapes. First check which clients forward `outputSchema` to the model.
8. Leaner structured output: round floats, provenance commit details only with `evidence`, dedupe relationships.
9. Compact server `instructions` (~10 lines: always pass cwd, recall before remember, get for full text, relate after remember); slim AGENT.md to a core page plus prompts.
10. Replace passive diagnostics (`anchor coverage: 0.00 (0/6)`) with actionable hints shown only when relevant.
11. Model matrix in `scripts/run-dogfood-packs.mjs` (e.g. Haiku 4.5 plus a local 8B model) tracking task success and tokens per task.

## Constraints to respect

File-first, no database or daemon; derived data gitignored and recoverable by delete + sync; no new I/O on cold paths; fail-soft to undefined; text/structured parity with `.describe()` and `Returns` bullets; AGENT.md, README.md and docs/index.html stay in sync; curated changelog.
