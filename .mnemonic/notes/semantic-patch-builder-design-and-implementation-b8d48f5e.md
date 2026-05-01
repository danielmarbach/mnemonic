---
title: 'Semantic Patch Builder: Design and Implementation'
tags:
  - design
  - ast
  - semantic-patch
  - update
  - markdown
  - llm-usability
lifecycle: permanent
createdAt: '2026-05-01T19:57:15.220Z'
updatedAt: '2026-05-01T19:57:15.220Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: theme-semantic-patch-improvements-lint-error-handling-headin-f2c4ced1
    type: explains
  - id: review-semanticpatch-llm-usability-fixes-4d4022ce
    type: derives-from
  - id: research-semanticpatch-failure-patterns-analysis-43e810a6
    type: derives-from
memoryVersion: 1
---
# Semantic Patch Builder: Design and Implementation

## Problem
The `update` tool originally required passing the entire note content for trivial edits, which was token-inefficient for large notes.

## Solution
Implementation of AST-based semantic patch editing via `remark` and `unified`. The `update` tool now supports an optional `semanticPatch` parameter (an array of patch operations) as an alternative to full `content` replacement.

## Architecture (5 Layers)
1. **Parser** (`src/markdown-ast.ts`): `remark` + `unified` → `mdast`.
2. **Query** (`src/semantic-patch.ts`): Selectors for `heading` (exact), `headingStartsWith`, `nthChild`, and `lastChild`.
3. **Patch** (`src/semantic-patch.ts`): Operations including `appendChild`, `prependChild`, `replace`, `replaceChildren`, `insertAfter`, `insertBefore`, and `remove`.
4. **Serializer** (`src/markdown-ast.ts`): `mdast` → markdown.
5. **Lint**: `attemptCleanMarkdown` provides a lenient variant that returns warnings instead of throwing hard errors.

## Key Design Decisions
- **No Silent Fallback**: If a `semanticPatch` fails (e.g., selector not found), the tool hard-fails. This forces the LLM to `get` the current note and regenerate the patch.
- **Lenient Lint for Patches**: Lint issues in patch values produce advisory warnings rather than hard errors, as small fragments can introduce trivial formatting quirks during serialization.
- **Schema-Level Guidance**: Proactive guidance is placed in the parameter description to prevent LLM fallback loops and ensure correct JSON structure.

## LLM Usability & Robustness
To reduce token waste and improve reliability, the following fixes were implemented:
- **Zod Preprocessing**: Added `z.preprocess()` to handle cases where LLMs pass the patch array as a JSON string literal.
- **Heading Operation Constraints**: `appendChild`, `prependChild`, and `replaceChildren` are rejected on heading selectors with clear guidance to use `insertAfter` for block content or `replace` for the heading text.
- **Expanded Examples**: The tool schema now includes explicit type unions and working examples to prevent common nesting and operation errors.

## Empirical Results
- **Token Savings**: Small patches (1 line) reduce payload size by ~93% compared to full note body replacement.
- **Verification**: Validated via `tests/semantic-patch.unit.test.ts` and integration tests.
