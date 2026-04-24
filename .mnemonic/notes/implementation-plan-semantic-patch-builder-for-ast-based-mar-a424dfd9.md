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
updatedAt: '2026-04-24T05:27:34.188Z'
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

**Files:**

- Modify: `package.json`
- Run tests to ensure no pre-existing breakage.

- [ ] **Step 1: Add dependencies**

  Add to `dependencies` in `package.json`:

  ```json
  "unified": "^11.0.0",
  "remark-parse": "^11.0.0",
  "remark-stringify": "^11.0.0"
  ```

- [ ] **Step 2: Install and verify**

  Run: `npm install`
  Expected: lock file updated, node_modules present.

## Task 2: Parser and Serializer (`src/markdown-ast.ts`)

**Files:**

- Create: `src/markdown-ast.ts`
- Test: `tests/markdown-ast.unit.test.ts`

- [ ] **Step 3: Write parser/serializer**

  ```typescript
  import { unified } from "unified";
  import remarkParse from "remark-parse";
  import remarkStringify from "remark-stringify";
  import type { Root } from "mdast";

  export function parseBody(content: string): Root {
    return unified().use(remarkParse).parse(content) as Root;
  }

  export function serializeBody(tree: Root): string {
    return unified().use(remarkStringify).stringify(tree) as string;
  }
  ```

- [ ] **Step 4: Write round-trip test**

  Two tests: simple markdown round-trip and list round-trip.

- [ ] **Step 5: Run tests**

  Run: `npx vitest run tests/markdown-ast.unit.test.ts`
  Expected: PASS (2 tests).

## Task 3: Semantic Patch Engine (`src/semantic-patch.ts`)

**Files:**

- Create: `src/semantic-patch.ts`
- Test: `tests/semantic-patch.unit.test.ts`

- [ ] **Step 6: Define types**

  SemanticSelector union: heading, headingStartsWith, nthChild, lastChild.
  SemanticOperation union: appendChild, prependChild, replace, replaceChildren, insertAfter, insertBefore, remove.
  SemanticPatch shape: selector + operation.

- [ ] **Step 7: Implement selector resolver**
  - Exact heading match: find node with type heading and matching text.
  - headingStartsWith: find heading where text starts with prefix.
  - nthChild: tree.children[index].
  - lastChild: tree.children[tree.children.length - 1].
  - Not found: collect available headings for diagnostic.

- [ ] **Step 8: Implement patch applicator**
  - appendChild: push valueNode children into target children.
  - prependChild: unshift valueNode children into target children.
  - replace: find parent, splice target out, replace with valueNode children.
  - replaceChildren: set target children to valueNode children.
  - insertAfter: find parent, splice valueNode children after target index.
  - insertBefore: find parent, splice valueNode children before target index.
  - remove: find parent, splice target out.

- [ ] **Step 9: Write unit tests**

  Three tests:
  - Appends paragraph under heading
  - Replaces a node
  - Throws on unknown heading with diagnostic listing available headings

- [ ] **Step 10: Run tests**

  Run: `npx vitest run tests/semantic-patch.unit.test.ts`
  Expected: PASS (3 tests).

## Task 4: Update `update` Tool Handler

**Files:**

- Modify: `src/index.ts`
- Modify: `src/structured-content.ts` (schema)
- Test: `tests/update-sem.patch.integration.test.ts`

- [ ] **Step 11: Import new modules in `src/index.ts`**

  Import `parseBody`, `serializeBody` from `./markdown-ast.js`.
  Import `applySemanticPatches`, `SemanticPatch` from `./semantic-patch.js`.

- [ ] **Step 12: Modify update tool schema**

  Add `semanticPatch` optional array parameter with selector + operation shapes.
  Handler destructures `semanticPatch` alongside existing fields.
  Validation: exactly one of `content` or `semanticPatch` must be present; both present is an error.

- [ ] **Step 13: Add semantic patch path in handler**

  If `semanticPatch` present: parse body, apply patches, serialize, `cleanMarkdown`.
  If `content` present: existing path.
  Catch errors and return `isError: true` with diagnostic message.

- [ ] **Step 14: Update tool description**

  Promote `semanticPatch` as primary for targeted edits; mark `content` as fallback for full rewrites.

- [ ] **Step 15: Write integration tests**

  One test: `remember` a note, then `update` with `semanticPatch` to append under heading and verify success.

- [ ] **Step 16: Run tests**

  Run: `npx vitest run tests/update-sem.patch.integration.test.ts`
  Expected: PASS (1 test).

## Task 5: Embedding Optimization

Already partially implemented: `content` changes trigger re-embed; `semanticPatch` body changes should do the same. The patch engine does not currently distinguish content-altering from structural-only patches, so re-embed conservatively when `semanticPatch` is provided. Future optimization can skip re-embed for structural-only patches.

No code change required; `updatedContent` difference will trigger existing conditional re-embed logic.

## Task 6: Documentation and Final Verification

- [ ] **Step 17: Update AGENT.md / README.md**

  Add a short section in the `update` tool guidance mentioning `semanticPatch` as preferred for edits.

- [ ] **Step 18: Run full test suite**

  Run: `npx vitest run`
  Expected: All tests pass.

---

## Self-Review Checklist

- [ ] Spec coverage: every design requirement maps to a task
- [ ] Placeholder scan: no TODO, TBD, or "implement later"
- [ ] Type consistency: `SemanticPatch`, `SemanticSelector`, `SemanticOperation` used consistently
- [ ] Backward compatibility: `content` path untouched except mutual-exclusivity validation
