---
title: Add Missing Unit Tests
tags:
  - testing
  - unit-tests
  - critical
  - p0-immediate
lifecycle: permanent
createdAt: '2026-03-08T14:25:52.432Z'
updatedAt: '2026-03-08T14:25:52.432Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Priority P0 - Add Critical Unit Tests

Per AGENT.md requirements:

- storage.ts: 100% coverage (critical for data integrity)
- vault.ts: 90%+ coverage (core to correct note storage/retrieval)

### tests/storage.test.ts (NEW - 100% coverage)

Test note operations:

- readNote/writeNote with complete frontmatter
- Backward compatibility with old schema versions
- Malformed markdown handling
- Frontmatter parsing edge cases

Test embedding operations:

- writeEmbedding/readEmbedding
- Model metadata persistence
- Missing embedding handling

Test note listing:

- listNotes with filters
- Tag filtering
- Project filtering

### tests/vault.test.ts (NEW - 90%+ coverage)

Test vault detection:

- Project vault detection (.mnemonic/ presence)
- Main vault isolation (isMainRepo guard)
- Non-git directory handling

Test note resolution:

- findNote across vaults
- Resolution order (project → main)
- cwd parameter handling

Test vault management:

- getOrCreateProjectVault behavior
- Vault initialization
- allKnownVaults enumeration

### Expand tests/migration.test.ts

- Test migration idempotency across vaults
- Test concurrent migration scenarios
- Test per-vault isolation

Reference: tests/migration.test.ts has 42 tests with robust patterns
