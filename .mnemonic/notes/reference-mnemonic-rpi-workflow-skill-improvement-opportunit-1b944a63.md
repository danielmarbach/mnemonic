---
title: >-
  Reference: mnemonic-rpi-workflow skill improvement opportunities from Phase 2
  execution
tags:
  - workflow
  - rpir
  - skill-improvement
  - commit-hygiene
  - phase2
lifecycle: permanent
createdAt: '2026-04-25T07:47:46.589Z'
updatedAt: '2026-04-25T07:47:46.589Z'
role: reference
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Reference: mnemonic-rpi-workflow skill improvement opportunities from Phase 2 execution

This note captures practical improvements observed while running a full Phase 2 RPIR cycle (research/plan/implement/review/consolidate) with multiple work and memory commits.

## Primary finding

Commit hygiene still needs repeated human reminders for many LLMs, even when RPIR is followed.

The current skill gives good commit-class guidance, but it would be stronger with explicit guardrails that are hard to skip in long sessions.

## Recommended skill improvements

### 1) Add a mandatory "commit hygiene gate" before every work commit

Require a short, explicit sequence in the skill:

1. `git status --short`
2. `git diff -- <target-files>`
3. confirm only intended files are staged
4. commit only those files
5. `git status --short` post-commit

Why: this prevents accidental inclusion of unrelated changes in dirty worktrees.

### 2) Add a required "dirty tree policy" section

The skill should explicitly say:

- never mix unrelated dirty files into the work commit
- if unrelated files exist, stage only exact intended paths
- if uncertain, stop and ask the user whether to split commits

Why: this is the most common failure mode under real branch conditions.

### 3) Strengthen commit-class protocol into a checklist with state transitions

Current classes are strong conceptually (memory -> work -> memory), but should be operationalized:

- mark class as active
- list required artifacts for that class
- block transition to next class until verification evidence is recorded

Why: reduces drift where memory notes or review evidence are skipped under time pressure.

### 4) Add a "verification evidence block" requirement to the review stage

Require storing concrete command evidence in review artifacts:

- command run
- pass/fail outcome
- key counts (e.g., tests passed)

Why: ensures review notes are auditable and not summary-only.

### 5) Add a "closeout consolidation template" for permanent notes

When closing a phase, require two durable captures by template:

- permanent decision note (what was decided and why)
- permanent summary note (what shipped, what was verified, final status)

Why: improves consistency and discoverability of completed work.

### 6) Add branch-finish handshake guidance

At workflow end, explicitly route to branch-finalization options (merge/PR/keep/discard) and require a clean status check first.

Why: avoids ambiguity after implementation is done.

### 7) Add optional anti-brittleness guidance for dogfooding checks

If dogfooding produces advisory-only failures, require root-cause classification:

- product regression vs. heuristic brittleness
- if heuristic brittleness, update check logic and re-verify

Why: prevents overfitting product code to brittle quality gates.

## Suggested concrete additions to skill text

- Add a "Commit Hygiene Checklist" subsection under Implement + Consolidate stages.
- Add a "Dirty Worktree Safety Rules" block near Commit Discipline.
- Add a "Phase Closeout Checklist" requiring decision+summary permanent notes and branch-finish handoff.

## Expected impact

- Fewer accidental mixed commits
- More consistent evidence-backed reviews
- Better reliability across weaker/less disciplined models
- More predictable phase completion quality
