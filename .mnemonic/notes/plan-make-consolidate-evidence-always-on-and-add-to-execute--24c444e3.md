---
title: 'Plan: make consolidate evidence always-on and add to execute-merge'
tags:
  - consolidate
  - evidence
  - execute-merge
lifecycle: temporary
createdAt: '2026-04-28T10:32:34.495Z'
updatedAt: '2026-04-28T10:32:34.495Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Plan: make consolidate evidence always-on and add to execute-merge

## Changes per file

### src/index.ts

1. Input schema: change param description from "Optional confidence signals..." to "Confidence signals for consolidation decisions (default: true for analysis strategies)"
2. Default in destructure: `evidence = false` → `evidence = true`
3. `executeMerge` function: add `evidence: boolean = true` param, pass from handler
4. In `executeMerge` text output: after mode line, add inline evidence block (lifecycle, role, age, risk for each source note, plus merge warnings)

### Tests

1. `tests/consolidate.unit.test.ts`: Update any test that expects `evidence: false` default behavior
2. `tests/tool-descriptions.integration.test.ts`: Update any description assertions

## Steps

- [x] Task 1: Flip default in handler + analysis strategy calls
- [ ] Task 2: Add evidence param to executeMerge + pass from handler
- [ ] Task 3: Render evidence inline in executeMerge text output
- [ ] Task 4: Update tests
- [ ] Task 5: Verify: typecheck → build → tests
