---
title: 'Review: semanticPatch LLM usability fixes'
tags:
  - workflow
  - review
  - semantic-patch
lifecycle: temporary
createdAt: '2026-05-01T12:02:05.224Z'
updatedAt: '2026-05-01T12:02:56.881Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-semanticpatch-failure-patterns-analysis-43e810a6
    type: derives-from
memoryVersion: 1
---
## Review: semanticPatch LLM usability fixes

### Research requirements to Implementation coverage

- Fix schema example (appendChild/replaceChildren with heading selectors to insertAfter/replace): **Covered** — example now uses insertAfter + replace + remove
- Fix guidance text in 2 locations (appendChild to insertAfter): **Covered** — both schema description and workflow hint corrected
- Add string preprocess for JSON arrays: **Covered** — z.preprocess auto-parses strings
- Fix 3 (optional — auto-redirect heading child ops): **Deferred** — behavioral change, not needed now

### Verification evidence (fresh, not reused from implementation)

- Command: `npm run build && vitest` — Result: pass (827 tests)
- Command: `vitest tests/update-sem-patch.integration.test.ts` — Result: pass (7 tests, including 2 new)
- Command: dogfood via MCP local server — string-wrapped array auto-parsed, heading appendChild still rejected, schema description corrected

### Unchecked items

None — all plan checkboxes addressed.

### Recommendation: continue
