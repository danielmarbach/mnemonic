---
title: 'Plan: Fix semanticPatch failure patterns'
tags:
  - workflow
  - plan
  - semantic-patch
lifecycle: temporary
createdAt: '2026-05-01T11:28:26.566Z'
updatedAt: '2026-05-01T12:03:03.372Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: review-semanticpatch-llm-usability-fixes-4d4022ce
    type: derives-from
  - id: research-semanticpatch-failure-patterns-analysis-43e810a6
    type: derives-from
memoryVersion: 1
---
## Plan

### Fix 1: Add Zod preprocess to handle string-wrapped semanticPatch arrays

**File:** `src/index.ts`
**What:** Add a `z.preprocess()` on the `semanticPatch` field that detects string inputs and attempts `JSON.parse()`. If parsing fails, return the original value so Zod's natural validation produces its usual error. If parsing succeeds, pass the parsed array through for schema validation.

**Why:** LLMs frequently wrap the JSON array in a string. Rather than relying on documentation alone, make the schema lenient on input and strict on semantics, following the existing principle of "schema-level guidance."

**Scope:**

- Add preprocess to the `semanticPatch` Zod schema
- Add unit tests verifying string-wrapped arrays are parsed correctly
- Add error tests verifying malformed strings still produce useful errors

### Fix 2: Fix misleading documentation recommending `appendChild` for headings

**Files:** `src/index.ts` (two locations)
**What:** Change both instances of the guidance text:

1. Line 2965: schema description — change "Use `appendChild` or `replace` instead" to "Use `insertAfter` to add block content under a heading, or `replace` to replace the heading entirely."
2. Line 6514: workflow hint — same change.

**Why:** The current text tells LLMs to use `appendChild` on headings, but the code rejects `appendChild` on headings with "Cannot appendChild to node of type 'heading'". This creates a retry loop.

### Fix 3 (optional enhancement): Auto-redirect heading child operations

**File:** `src/semantic-patch.ts`
**What:** Instead of rejecting `appendChild`/`prependChild` on headings, auto-redirect:

- `appendChild` on heading → `insertAfter` (semantically correct: "add content under the heading")
- `prependChild` on heading → `insertAfter` (insert after heading, before existing body)
- `replaceChildren` on heading → replace the heading text children (legitimate use case for changing heading wording)

**Why:** Makes the API match LLM intuition. "Append under a heading" is the most natural intent and `insertAfter` is the correct implementation. Auto-redirect eliminates the entire class of errors.

**Note:** This is a behavioral change. The simpler fix (Fix 2) is sufficient for now. Consider Fix 3 as a follow-up.

## Checkboxes

- [ ] Add Zod preprocess for string-wrapped semanticPatch arrays
- [ ] Add tests for string input handling
- [ ] Fix schema description guidance (line 2965)
- [ ] Fix workflow hint guidance (line 6514)
- [ ] Run existing test suite to verify no regressions
- [ ] Update mnemonic research/plan notes
