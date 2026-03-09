---
title: Create Integration Test Suite
tags:
  - testing
  - integration
  - critical
  - p1-immediate
lifecycle: permanent
createdAt: '2026-03-08T14:25:52.432Z'
updatedAt: '2026-03-08T14:25:52.432Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Priority P1 - Create Comprehensive Integration Test Suite

Current coverage: 4 integration tests for 23 tools (18%)
Target coverage: ~26 integration tests (80%+)

### Test Categories Needed

Core Memory Operations (6 tests):

- remember project scope → creates .mnemonic/notes/
- remember global scope → creates ~/mnemonic-vault/notes/
- update modifies content, re-embeds, commits
- update modifies title/tags only
- forget deletes note + embedding + cleans relationships
- get returns multiple notes by ID

Cross-Vault Operations (4 tests):

- move_memory between main ↔ project vault
- relate creates bidirectional links
- relate creates unidirectional links
- unrelate removes relationships

Project Operations (3 tests):

- detect_project identifies git repo
- set_project_identity changes remote
- get_project_identity shows effective identity

Consolidate Tool (5 tests):

- detect-duplicates similarity detection
- find-clusters relationship grouping
- suggest-merges recommendations
- execute-merge combines notes
- prune-superseded removes old notes

Sync Operations (3 tests):

- sync bidirectional operations
- sync handles deleted notes
- sync continues on vault failure

Total: ~22 new tests needed

Pattern: Follow tests/migration.test.ts structure (42 tests, comprehensive coverage)
