---
title: 'Request: Split index.ts into modular structure'
tags:
  - workflow
  - request
  - refactoring
lifecycle: temporary
createdAt: '2026-05-02T06:05:41.932Z'
updatedAt: '2026-05-02T06:07:38.908Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: typescript-code-review-mnemonic-project-961d984b
    type: related-to
  - id: research-index-ts-dependency-analysis-for-modular-extraction-07f545d4
    type: derives-from
memoryVersion: 1
---
## Request

Refactor `src/index.ts` (6,664 lines) into a modular structure. The file is a monolithic entry point mixing CLI commands, config constants, 20+ MCP tool handlers, helper functions, prompt registrations, and startup logic. Zero exports — everything is module-private.

## Motivation

- Reviewed in TypeScript code review (memory `typescript-code-review-mnemonic-project-961d984b`) and flagged as a deferred improvement
- The file is difficult to navigate, test, and reason about
- Individual tool handlers can't be unit-tested in isolation
- Helper functions are tightly coupled to module-level singletons

## Scope

Full extraction of all tool handlers, CLI commands, helpers, and prompts into separate modules, leaving a slim entry point that wires everything together.
