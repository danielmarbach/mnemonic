---
title: 'Apply: Phase 5 stateful dogfooding before behavior changes'
tags:
  - workflow
  - apply
  - dogfooding
  - diagnostics
  - stateful
lifecycle: temporary
createdAt: '2026-05-13T04:27:57.116Z'
updatedAt: '2026-05-13T04:27:57.116Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Apply: Phase 5 Stateful Dogfooding Before Behavior Changes

Implements Phase 5 of `plan-advisory-memory-health-diagnostics-from-microsoft-memor-a0aa3e62`.

## Goal

Validate diagnostics over realistic memory evolution before changing ranking/lifecycle behavior. Using local build, not the installed MCP in session.

## Dogfooding Scenarios

- Research-heavy RPIR task with multiple temporary research notes
- Plan/apply/review workflow where overlap is expected lineage, not duplication
- Completed feature arc where temporary notes should consolidate into a permanent summary
- Superseded decision chain where pruning may be appropriate after review
- Broad orientation query versus targeted recall query

## Measurements

- Did diagnostics identify real maintenance needs?
- Did diagnostics create false pressure to merge unique evidence?
- Did agents choose better next actions because of warnings?
- Did recall remain precise and project summary remain useful?
- Were there any hidden writes, ranking changes, or silent omissions?

## Exit Criteria

- Advisory diagnostics are useful enough to keep.
- No evidence supports automatic forgetting.
- Any future ranking or lifecycle behavior change has separate plan/research evidence.

## Status

In progress — running dogfooding scenarios with local build.
