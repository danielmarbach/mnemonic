---
title: 'Implementation Plan: Semantic Patch Builder for AST-Based Markdown Updates'
tags:
  - plan
  - semantic-patch
  - ast
  - update
  - implementation
lifecycle: permanent
createdAt: '2026-04-24T05:27:34.188Z'
updatedAt: '2026-04-24T10:48:43.959Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Implementation Plan: Semantic Patch Builder for AST-Based Markdown Updates

## Goal

Add AST-based semantic patch editing to the `update` tool, reducing token usage and avoiding unnecessary embedding regeneration.

## Architecture

Introduce `remark`/`unified` for parse/serialize, a `semantic-patch.ts` engine for selectors and operations, and integrate into the existing `update` handler with mutual exclusivity against `content`.

## Tech Stack

TypeScript, `unified`, `remark-parse`, `remark-stringify`; reuse `src/markdown.ts` for lint.

---

## Task 1: Setup Dependencies

- [x] **Step 1: Add dependencies** — Added unified, remark-parse, remark-stringify to package.json
- [x] **Step 2: Install and verify** — npm install completed, lock file updated

## Task 2: Parser and Serializer (`src/markdown-ast.ts`)

- [x] **Step 3: Write parser/serializer** — Created with bullet: "-" option for remark-stringify
- [x] **Step 4: Write round-trip test** — 2 tests for simple and nested markdown
- [x] **Step 5: Run tests** — PASS (2 tests)

## Task 3: Semantic Patch Engine (`src/semantic-patch.ts`)

- [x] **Step 6: Define types** — SemanticSelector, SemanticOperation, SemanticPatch
- [x] **Step 7: Implement selector resolver** — heading exact match, headingStartsWith, nthChild, lastChild, with diagnostic error for not found
- [x] **Step 8: Implement patch applicator** — appendChild, prependChild, replace, replaceChildren, insertAfter, insertBefore, remove
- [x] **Step 9: Write unit tests** — 11 tests covering all operations and error cases
- [x] **Step 10: Run tests** — PASS (11 tests)

## Task 4: Update `update` Tool Handler

- [x] **Step 11: Import new modules** — Imported `applySemanticPatches` and `SemanticPatch` type
- [x] **Step 12: Modify update tool schema** — Added `semanticPatch` optional array parameter; mutual exclusivity validation for content and semanticPatch both provided
- [x] **Step 13: Add semantic patch path in handler** — semanticPatch present: parse body, apply patches, serialize, cleanMarkdown; error caught with diagnostic message
- [x] **Step 14: Update tool description** — Descriptions promote semanticPatch as primary for targeted edits
- [x] **Step 15: Write integration tests** — 4 tests: patch + verify, both params rejected, missing selector rejected, metadata-only still allowed
- [x] **Step 16: Run tests** — PASS (4 integration tests)

## Task 5: Embedding Optimization

- [x] **Step: Conservative re-embed** — When semanticPatch is provided, the changed content triggers existing conditional re-embed logic. Future optimization can skip re-embed for structural-only patches.

## Task 6: Documentation and Final Verification

- [x] **Step 17: Update CHANGELOG.md** — Added 0.24.0 entry
- [x] **Step 18: Run full test suite** — PASS (653 tests, 0 failures)

---

## Self-Review Checklist

- [x] Spec coverage: every design requirement maps to a delivered implementation
- [x] Placeholder scan: no TODO, TBD, or "implement later"
- [x] Type consistency: `SemanticPatch`, `SemanticSelector`, `SemanticOperation` used consistently
- [x] Backward compatibility: `content` path untouched except mutual-exclusivity validation for both-provided case
