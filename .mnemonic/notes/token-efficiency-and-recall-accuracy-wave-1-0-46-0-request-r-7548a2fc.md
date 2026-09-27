---
title: >-
  Token efficiency and recall accuracy wave 1 (0.46.0): request, research, plan,
  apply, review
tags:
  - workflow
  - apply
  - token-efficiency
  - recall
  - plan
  - request
  - research
  - hybrid-search
  - accuracy
  - weak-models
  - tool-surface
  - review
lifecycle: permanent
createdAt: '2026-09-27T20:54:32.381Z'
updatedAt: '2026-09-27T20:54:32.381Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: derives-from
  - id: canonical-design-bounded-rrf-hybrid-recall-172a96ab
    type: related-to
  - id: implementation-principles-for-mnemonic-mcp-2e178bba
    type: derives-from
  - id: duckdb-as-a-derived-retrieval-index-evaluation-and-recommend-6c4c32b9
    type: follows
memoryVersion: 1
---
## Consolidated from:
### Apply: token efficiency and recall accuracy wave 1 (0.46.0)
*Source: `apply-token-efficiency-and-recall-accuracy-wave-1-0-46-0-4a05618e`*

Implementation record for wave 1. Plan: `plan-token-efficiency-and-recall-accuracy-wave-1-lanes-l1-l6-0470831c`. Branch `improve/token-efficiency-and-recall-accuracy`, released as 0.46.0 (`1af620b`).

Execution changed from delegated lanes to in-session implementation: pi-subagents children could not launch from this Claude-bridge session (MCP direct-tool selectors unresolved, then pi-claude-bridge prompt-capture rejected fresh child prompts). The user chose to implement in session; review was done in session against the plan constraints instead of by a fresh-context Opus reviewer.

## Delivered

- [x] L1 `f84aea4` fix(remember): `policyScope` added to `RememberToolResultSchema`; compile-time assertion that flattened tool schemas cover every handler field (remember, update); test helpers now validate every tools/call response against the registered outputSchema, like MCP clients do. The guard failed exactly the 5 affected tests before the fix, and found no drift in any other tool.
- [x] L2 `8af072d` deterministic recall eval: 37-note fixture (two projects + globals), 47 known-item queries in five kinds, feature-hashing embedder, `npm run eval:recall` (`--explain`, `--ollama`, `--update-baseline`), regression test against `baseline.json`, documented in CONTRIBUTING.
- [x] L3 `27d5596` fix(recall): projections persist body identifiers (lexical-only, embeddings untouched), identifier-aware tokenize (joined form + camelCase parts), legacy projections rebuild lazily.
- [x] L4 `a72f392` feat(recall): `detail: "brief"` default with summary + query-matched passage + get hint; `detail: "full"` restores bodies; weak-match hint; rounded scores.
- [x] L5 `2031d3b` feat(list): `limit` (50/200) + opaque `cursor`, `total` always present, `nextCursor`; `count` is per page.
- [x] L6 `e11cadc` feat: MCP server instructions (~700 chars) and `MNEMONIC_TOOLSET=core` (9 tools).
- [x] Release `1af620b`: 0.46.0 in package.json, lockfile, CHANGELOG.

## Measurements

- Eval (hash embeddings): identifier MRR@10 0.42 -> 0.79, S@5 0.50 -> 1.00, S@1 0.33 -> 0.58; body S@1 0.20 -> 0.30; title 1.00 and project-affinity 0.88 unchanged.
- Recall text on a copy of this vault with real embeddings: 131.8 KB -> 31.6 KB over six queries (-76%).
- tools/list: full 146.7 KB (57.0 KB without output schemas), core 78.5 KB (29.2 KB).
- Warm recall latency 163 ms -> 176-181 ms (+8-11%). First recall after upgrade 1.8 s while 125 legacy projections rebuild once.

## Deviations

- L4 kept the `scope notes | themes | anchor coverage` text line: implementation principles require recall diagnostics in text. An anchor-coverage hint was dropped because it would fire on most topical queries.
- L4 rounds decomposition priors to 4 decimals, not 3, because priors are 0.0025-scale.
- L5 keeps the existing list order (current project, other projects, global, by title) instead of newest-first; an early re-sort broke two tests that depend on that order. Added an id tie-breaker for reliable cursors.
- L6 names full-only tools in core-mode instructions instead of rewriting five tool descriptions that mention them.
- L3 plan target "top 3 for body identifiers" holds on the fixture and integration test, but on the real vault `recallScopeNoteCount` holders rank #3 and #7: notes that match the camelCase parts in both semantic and lexical channels outrank a single-channel exact match. Same root cause as the fixture's rank-2 misses: role metadata prior (0.012) exceeds the lexical rank-1 vs rank-4 RRF gap (0.0023). Needs a fusion-policy decision in wave 2.

### Plan: token efficiency and recall accuracy wave 1 (lanes L1-L6)
*Source: `plan-token-efficiency-and-recall-accuracy-wave-1-lanes-l1-l6-0470831c`*

Executable plan for wave 1 of the token-efficiency and recall-accuracy work. Request: `request-token-efficiency-and-recall-accuracy-wave-1-ce6f830c`. Research: `research-token-efficiency-and-recall-accuracy-improvements-m-fe9233c8`.

## Global constraints (every lane)

- File-first: no database, daemon, synced index or new runtime dependency.
- Derived data stays gitignored and recoverable by deleting generated files and running `sync`.
- No new I/O on cold or fallback paths; fail-soft to `undefined`, never throw from diagnostics.
- Every new or changed output field has a Zod `.describe()`, a `Returns` bullet in the tool description, a text rendering, and an integration test that parses the real MCP response through the registered schema plus a test asserting on the text.
- When tool behavior changes, AGENT.md, README.md and docs/index.html stay in sync.
- CHANGELOG: add user-focused bullets (1-2 sentences, outcome first) under `## [Unreleased]` at the top, creating the heading if missing.
- Commit only intended paths on the lane branch; never `git add .`/`-A`; never touch `.mnemonic/`.
- `npm run build`, `npm run lint`, `npm run format:check` and `npx vitest run` pass (baseline on the branch: 89 files, 1453 tests, all green).

## Lanes

### L1 remember-schema (Fixed)

- [x] Add `policyScope` to `RememberToolResultSchema` in `src/structured-content.ts` so the registered schema matches what `remember` emits when a project memory policy exists.
- [x] Add an integration test that calls `remember` in a project with a saved policy and parses the real response through the registered schema.
- [x] Add a test that runs every registered tool's structuredContent through its registered output schema where a fixture exists, or at minimum statically diffs handler result interfaces against registered schemas, to catch this drift class.
- [x] CHANGELOG Fixed bullet. No doc surfaces change.

### L2 eval-harness (tooling, no ranking change)

- [x] Add a deterministic retrieval eval: fixture vault under `tests/fixtures/recall-eval/` with known-item queries of three kinds (title-derived, body-window, exact identifier), metrics MRR@10 and Success@1 per kind.
- [x] Deterministic embeddings without Ollama (fixture-cached vectors or a deterministic test embedder already used by tests); runnable in CI via an npm script (e.g. `npm run eval:recall`) and a vitest test that asserts metrics do not regress below a recorded baseline.
- [x] Record the baseline numbers in the lane report. No src ranking changes. Document the harness in CONTRIBUTING.md; no CHANGELOG entry needed.

### L3 body-identifiers (Fixed/Changed)

- [x] Extract an uncapped identifier set from the full note body (backtick code spans, camelCase, PascalCase, snake_case, SCREAMING_SNAKE, kebab-case, dotted versions) into a lexical-only projection field.
- [x] Tokenizer emits compounds both joined and split (`RRF_K` -> `rrf_k`, `rrf`, `k`; `buildNoteWarnings` -> `buildnotewarnings`, `build`, `note`, `warnings`).
- [x] The embedding input (`embedTextForNote` -> `projectionText`) must NOT change, so no re-embedding is triggered.
- [x] Bump the projection version so stale projections regenerate lazily through the existing path.
- [x] Tests: a body-only identifier (e.g. deep in a long note) gets a lexical rank and reaches the top results.
- [x] Owns `src/projections.ts`, `src/lexical.ts`, lexical parts of `src/tools/recall-helpers.ts`. CHANGELOG bullet; ARCHITECTURE.md if it documents projections.

### L4 recall-output (Changed)

- [x] Recall text by default renders per result: title, id, metadata line, projection summary, and one query-focused snippet (not the full body).
- [x] New `detail: "brief" | "full"` param (default `brief`); `full` restores current output.
- [x] Text ends with a hint to call `get` with the ids for full content.
- [x] Replace passive header diagnostics (`scope notes`, `themes`, `anchor coverage`) with actionable hints shown only when relevant; structured diagnostics stay.
- [x] Round score-like floats in recall structured output to 3 decimals.
- [x] `get` output must not change (formatNote is shared).
- [x] Owns `src/tools/recall.ts` rendering, the recall schema in `src/structured-content.ts`, recall tests. CHANGELOG, README, AGENT.md, docs/index.html.

### L5 list-paging (Changed)

- [x] `list` gets a default `limit` (50) and an opaque `cursor`; response includes `nextCursor` and `total`.
- [x] Text renders one line per note (title, id, lifecycle, updatedAt).
- [x] Owns `src/tools/list.ts`, list schema, list tests. CHANGELOG, README, AGENT.md, docs/index.html.

### L6 surface (Added)

- [x] Set MCP server `instructions` (about 10 lines: always pass `cwd`; `recall` before `remember`; `get` for full content; `relate` after `remember`; use `update` instead of duplicating).
- [x] `MNEMONIC_TOOLSET=core|full` env (default `full` to stay backward compatible); `core` registers recall, get, remember, update, relate, list, sync, project_memory_summary, consolidate.
- [x] Tests for both toolsets and the instructions text.
- [x] Owns `src/index.ts`, `src/tools/index.ts`, `src/config.ts`. CHANGELOG, README, AGENT.md, docs/index.html.

## Self-check

Every research proposal maps to a wave-1 lane or is explicitly deferred to wave 2: project-affinity gating, superseded collapse, chunk embeddings for long notes, output-schema trimming, the `cwd` description dedupe across 27 tools, the dogfood model matrix. Wave 2 waits for the L2 baseline. No placeholders.

## Status

All items delivered in 0.46.0; see `apply-token-efficiency-and-recall-accuracy-wave-1-0-46-0-4a05618e` and `review-token-efficiency-and-recall-accuracy-wave-1-0-46-0-e221f011` for deviations and wave-2 findings.

### Request: token efficiency and recall accuracy wave 1
*Source: `request-token-efficiency-and-recall-accuracy-wave-1-ce6f830c`*

Make mnemonic more token-efficient and more accurate in results, including for weaker models, without breaking the file-first design constraints.

Branch: `improve/token-efficiency-and-recall-accuracy`. Research: `research-token-efficiency-and-recall-accuracy-improvements-m-fe9233c8`.

Execution: parallel lanes in dedicated git worktrees under `../mnemonic-lanes/<lane>` on branches `lane/<lane>`. Writers use claude-bridge/claude-sonnet-5, fresh-context reviewers use claude-bridge/claude-opus-5-5. The parent integrates the lanes into the dedicated branch. Each lane owns its CHANGELOG and, where needed, README/AGENT.md/docs/index.html updates.

### Research: token efficiency and recall accuracy improvements (measured 2026-09-27)
*Source: `research-token-efficiency-and-recall-accuracy-improvements-m-fe9233c8`*

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

### Review: token efficiency and recall accuracy wave 1 (0.46.0)
*Source: `review-token-efficiency-and-recall-accuracy-wave-1-0-46-0-e221f011`*

Outcome: continue

Review of wave 1 / release 0.46.0 against plan `plan-token-efficiency-and-recall-accuracy-wave-1-lanes-l1-l6-0470831c` and apply note `apply-token-efficiency-and-recall-accuracy-wave-1-0-46-0-4a05618e`. Performed in session (the requested fresh-context Opus reviewer could not be launched; see apply note), with fresh verification runs.

## Verification

- Command: `npm run verify:release` (build, full vitest, isolated dogfood). Result: pass. Details: 96 files, 1510 tests; dogfood exit 0; one advisory "packA: recall answers canonical design questions" also fires on the base commit `87912c6`, so it predates this branch.
- Command: `npm run lint`, `npm run format:check`, `npm run typecheck`. Result: pass.
- Command: `npm pack --dry-run`. Result: pass. Details: 0.46.0, 403 files, new modules present, no tests/fixtures/vault/eval files.
- Command: release smoke test from the packed tarball with real Ollama and client-side outputSchema validation. Result: pass (16/16). Details: remember under a saved policy validates (the 0.45.x bug), body identifier found, brief/full recall, list paging, get, full=28 and core=9 tools, instructions sent, legacy projections on a copy of this vault rebuilt with identifiers, projectionText unchanged.
- Command: warm recall latency, base vs branch, 4 queries x 5 runs, two rounds. Result: partial. Details: 163 ms -> 176-181 ms.
- Command: `npm run eval:recall`. Result: pass. Details: baseline updated with L3 gains, deterministic across runs.

## Constraint checklist

| Constraint | Status | Evidence |
| --- | --- | --- |
| File-first, no database/daemon/new runtime dependency | pass | No dependency changes; identifiers persist in existing projection JSON |
| Derived data recoverable by delete + sync | pass | `identifiers` lives in gitignored projections; legacy projections rebuild via `isProjectionStale` |
| No new I/O on cold/fallback paths | pass with note | Snippet and summary use the note already read by `readCachedNote`; lexical tokens stay session-cached keyed by lexical text. One-time body read per legacy projection, same precedent as `contentSignals` |
| Fail-soft to undefined | pass | `selectQuerySnippet` returns undefined; hints omitted when not applicable |
| Zod `.describe()` + Returns bullet + text + real-response schema test for new fields | pass | recall `detail`, list `limit`/`cursor`/`total`/`nextCursor`, remember `policyScope`; helpers now schema-validate every integration call |
| Embeddings unchanged by identifiers | pass | Unit test and smoke test assert identical `projectionText` |
| AGENT.md, README.md, docs/index.html in sync | pass | Updated per lane; config tables list `MNEMONIC_TOOLSET` |
| Curated CHANGELOG | pass | 0.46.0 Added/Changed/Fixed, user-facing, `count` semantics called out |
| Weak-model support | pass | Server instructions, core toolset, get hint, weak-match hint |

## Findings for wave 2

- P1 fusion policy: RESOLVED in `8489805`. A prior would have been retrieval evidence disguised as policy, against the rank-only canonical design, so the fix is a fourth equally weighted RRF channel for exact identifiers. Canonical design note updated.
- P2 latency: after `8489805` warm recall is 162 -> 169 ms (+4%); identifier queries show no measurable extra cost.
- P2 relationship previews are now the largest part of brief recall output.
- Still open from research: project-affinity gating (fixture S@1 0.88), superseded collapse, chunk embeddings for long notes, output-schema trimming, cwd description dedupe, model-matrix dogfood.

## Unchecked items

None from the plan. Delegated execution and Opus review were not performed (infrastructure blocker, user redirected).

## Addendum: ranking fix and alignment check (`8489805`)

Checked against the canonical RRF design, the RRF alignment apply note and the DuckDB decision:

| Decision | Status | Evidence |
| --- | --- | --- |
| Retrieval evidence is rank-only; priors are bounded policy | pass | Identifier evidence enters as `identifierRank` in `computeHybridScore`, no new prior |
| Equal channel weighting, K=60, 100-rank window | pass | Same `1/(RRF_K + rank)` term and `assignDenseRanks` window |
| Missing channels contribute zero | pass | Natural-language queries produce no identifier keys, so no rank |
| Lexical channel stays in-process TF-IDF, no BM25 | pass | TF-IDF scoring unchanged; identifier matching reads the same cached tokens |
| Exact identifiers must be recallable with weak semantic similarity | pass | Holders outside the lexical top 25 still reach fusion |
| Language independence | pass after fix | Snippet selection used an English stopword list; replaced by inverse paragraph frequency |
| Deterministic ordering | pass | Identifier ranks tie-break on lexical evidence, then note id; eval rows identical across runs |

Fresh verification after the fix: `npm run verify:release` pass (96 files, 1516 tests, dogfood exit 0 with the pre-existing advisory); tarball smoke test 16/16; eval baseline updated.
