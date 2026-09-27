---
title: 'Plan: token efficiency and recall accuracy wave 1 (lanes L1-L6)'
tags:
  - workflow
  - plan
  - token-efficiency
  - recall
lifecycle: temporary
createdAt: '2026-09-27T12:06:29.255Z'
updatedAt: '2026-09-27T12:06:29.255Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
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

- [ ] Add `policyScope` to `RememberToolResultSchema` in `src/structured-content.ts` so the registered schema matches what `remember` emits when a project memory policy exists.
- [ ] Add an integration test that calls `remember` in a project with a saved policy and parses the real response through the registered schema.
- [ ] Add a test that runs every registered tool's structuredContent through its registered output schema where a fixture exists, or at minimum statically diffs handler result interfaces against registered schemas, to catch this drift class.
- [ ] CHANGELOG Fixed bullet. No doc surfaces change.

### L2 eval-harness (tooling, no ranking change)

- [ ] Add a deterministic retrieval eval: fixture vault under `tests/fixtures/recall-eval/` with known-item queries of three kinds (title-derived, body-window, exact identifier), metrics MRR@10 and Success@1 per kind.
- [ ] Deterministic embeddings without Ollama (fixture-cached vectors or a deterministic test embedder already used by tests); runnable in CI via an npm script (e.g. `npm run eval:recall`) and a vitest test that asserts metrics do not regress below a recorded baseline.
- [ ] Record the baseline numbers in the lane report. No src ranking changes. Document the harness in CONTRIBUTING.md; no CHANGELOG entry needed.

### L3 body-identifiers (Fixed/Changed)

- [ ] Extract an uncapped identifier set from the full note body (backtick code spans, camelCase, PascalCase, snake_case, SCREAMING_SNAKE, kebab-case, dotted versions) into a lexical-only projection field.
- [ ] Tokenizer emits compounds both joined and split (`RRF_K` -> `rrf_k`, `rrf`, `k`; `buildNoteWarnings` -> `buildnotewarnings`, `build`, `note`, `warnings`).
- [ ] The embedding input (`embedTextForNote` -> `projectionText`) must NOT change, so no re-embedding is triggered.
- [ ] Bump the projection version so stale projections regenerate lazily through the existing path.
- [ ] Tests: a body-only identifier (e.g. deep in a long note) gets a lexical rank and reaches the top results.
- [ ] Owns `src/projections.ts`, `src/lexical.ts`, lexical parts of `src/tools/recall-helpers.ts`. CHANGELOG bullet; ARCHITECTURE.md if it documents projections.

### L4 recall-output (Changed)

- [ ] Recall text by default renders per result: title, id, metadata line, projection summary, and one query-focused snippet (not the full body).
- [ ] New `detail: "brief" | "full"` param (default `brief`); `full` restores current output.
- [ ] Text ends with a hint to call `get` with the ids for full content.
- [ ] Replace passive header diagnostics (`scope notes`, `themes`, `anchor coverage`) with actionable hints shown only when relevant; structured diagnostics stay.
- [ ] Round score-like floats in recall structured output to 3 decimals.
- [ ] `get` output must not change (formatNote is shared).
- [ ] Owns `src/tools/recall.ts` rendering, the recall schema in `src/structured-content.ts`, recall tests. CHANGELOG, README, AGENT.md, docs/index.html.

### L5 list-paging (Changed)

- [ ] `list` gets a default `limit` (50) and an opaque `cursor`; response includes `nextCursor` and `total`.
- [ ] Text renders one line per note (title, id, lifecycle, updatedAt).
- [ ] Owns `src/tools/list.ts`, list schema, list tests. CHANGELOG, README, AGENT.md, docs/index.html.

### L6 surface (Added)

- [ ] Set MCP server `instructions` (about 10 lines: always pass `cwd`; `recall` before `remember`; `get` for full content; `relate` after `remember`; use `update` instead of duplicating).
- [ ] `MNEMONIC_TOOLSET=core|full` env (default `full` to stay backward compatible); `core` registers recall, get, remember, update, relate, list, sync, project_memory_summary, consolidate.
- [ ] Tests for both toolsets and the instructions text.
- [ ] Owns `src/index.ts`, `src/tools/index.ts`, `src/config.ts`. CHANGELOG, README, AGENT.md, docs/index.html.

## Self-check

Every research proposal maps to a wave-1 lane or is explicitly deferred to wave 2: project-affinity gating, superseded collapse, chunk embeddings for long notes, output-schema trimming, the `cwd` description dedupe across 27 tools, the dogfood model matrix. Wave 2 waits for the L2 baseline. No placeholders.
