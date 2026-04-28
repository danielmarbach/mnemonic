---
title: 'Request: make consolidate evidence always-on and add to execute-merge'
tags:
  - workflow
  - request
  - consolidate
  - evidence
lifecycle: temporary
createdAt: '2026-04-28T10:31:57.558Z'
updatedAt: '2026-04-28T11:25:50.753Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-consolidate-evidence-defaults-and-execute-merge-saf-8560d01e
    type: derives-from
memoryVersion: 1
---
# Request: make consolidate evidence always-on and add safety net at mutation point

Consolidate analysis strategies (detect-duplicates, suggest-merges, dry-run) currently default `evidence: false`. This means LLMs must remember to opt in. If they skip it, merge/duplicate analysis lacks lifecycle, risk, and supersession context — increasing chance of bad merges.

Additionally, `execute-merge` has zero evidence support. Even if analysis runs with evidence, the LLM could call `execute-merge` blindly without surfacing trust signals at the mutation point.

## Scope

1. Flip `evidence` default from `false` to `true` for `detect-duplicates`, `suggest-merges`, `dry-run`.
2. Add `evidence` parameter + trust signals inline in `execute-merge` output.
3. Update tool descriptions for new defaults.
4. Update tests.

## Constraints

- Maintain backwards compatibility (parameter stays boolean, just default flips).
- execute-merge evidence now appears in both text and structured output (executeMergeEvidence field).
- dryRunAll now merges duplicatePairs, mergeSuggestions, themeGroups, relationshipClusters from delegated strategies into its structured output.
- Token overhead negligible for consolidation (small result sets).
