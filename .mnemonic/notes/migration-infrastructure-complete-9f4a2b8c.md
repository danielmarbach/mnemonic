---
title: Migration infrastructure implementation summary
tags:
  - architecture
  - migration
  - implementation
  - decisions
  - mcp-tools
lifecycle: permanent
createdAt: '2026-03-08T01:45:00.000Z'
updatedAt: '2026-03-08T01:45:00.000Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-migration-strategy-7f2e8c3d
    type: related-to
memoryVersion: 1
---
# Migration Infrastructure Implementation - Complete

## What was built

**Migration framework** (`src/migration.ts`):
- `Migrator` class managing all migrations
- Version comparison logic for semver strings
- Migration runner supporting dry-run and execute modes
- Auto-commit of modified files only (not all uncommitted changes)

**First migration** (`v0.1.0-backfill-memory-versions`):
- Adds `memoryVersion: 1` to notes lacking version markers
- Backfills all 20 notes in mnemonic's project vault
- Idempotent: re-running doesn't change already-migrated notes

**CLI commands**:
- `mnemonic migrate --help` - Shows workflow emphasizing dry-run first
- `mnemonic migrate --list` - Lists available migrations and pending count
- `mnemonic migrate --dry-run` - Previews changes without modifying
- `mnemonic migrate` - Executes migration with auto-commit

**MCP tools**:
- `list_migrations` - List available migrations and schema version
- `execute_migration` - Run migrations with dryRun parameter

**Documentation**:
- Tools added to README.md and AGENT.md (alphabetically sorted)
- Testing requirements updated to include migration test patterns
- Documentation requirement: new tools must be added to both README and AGENT

## Key decisions that matter

### 1. Two-level versioning scheme

**Schema version** (`"1.0"` in config.json):
- Semver for vault-level migration infrastructure
- Tracks when migration system itself changes
- Future: adding new migration types → bump to "1.1"

**Memory version** (`1` in note frontmatter):
- Integer for individual note format changes
- Notes can have different versions in same vault
- Future: adding `priority` field → new notes get `memoryVersion: 2`

Rationale: Separates concerns. Schema can bump without requiring every note to be rewritten.

### 2. Auto-commit behavior

**What gets committed:**
- Only files modified during migration (tracked via `modifiedNoteIds`)
- Does NOT commit unrelated uncommitted changes in vault
- Commit message includes counts: "Modified: X note(s), Processed: Y note(s)"

**Why not commit everything:**
- Prevents accidentally committing work-in-progress
- Keeps migration commits atomic and focused
- Users can manually commit their other changes separately

**Failure handling:**
- Commit failures are warnings, not errors
- Migration succeeds even if commit fails
- User can manually commit if needed

### 3. Dry-run is strongly encouraged but not forced

**CLI help explicitly guides users:**
1. Use `--dry-run` first to see what will change
2. Review output carefully  
3. Run without `--dry-run` to execute

**But doesn't require it:**
- Users might know what they're doing
- In scripts/automation, dry-run might not be needed
- Auto-commit provides safety net

Rationale: Education over enforcement. Document the workflow clearly, trust users to follow it.

### 4. Version numbering consistency

Changed schema version from `"0.1"` → `"1.0"` to align with memory version `1`:
- Before: 0.1 vs 1 (confusing)
- After: 1.0 vs 1 (clearer distinction between semver vs integer)

This makes the conceptual difference between schema (semver) and format (integer) more obvious.

## Dogfooding results

**Test setup:**
- Created test note without `memoryVersion`
- Ran migration in dry-run mode
- Verified it detected the missing version
- Executed actual migration

**Results:**
- Processed: 20 notes (1 new + 19 existing)
- Modified: 1 note (the test note)
- Auto-committed: test-note-no-version.md only
- Other uncommitted files (AGENT.md, PLAN.md, src/*.ts) remained untouched ✓

This validated the "only commit what the migration touched" approach works correctly.

## Testing coverage

**Migration framework tests:**
- Version comparison for semver strings (0.0, 0.9, 1.0, 1.1)
- Migration detection based on current schema version
- Dry-run vs execute behavior
- Error handling for malformed notes
- Per-vault isolation

**Test patterns established:**
- `src/migration.ts` → `tests/migration.test.ts`
- Follow same pattern for future test files

## What to remember

**For future migrations:**
- Always support `dryRun` mode
- Track `modifiedNoteIds` for precise commits
- Test idempotency (re-running should be safe)
- Add tests for version comparison edge cases

**For new MCP tools:**
- Must be added to both README.md and AGENT.md tables
- Keep tables alphabetically sorted
- Document parameters in AGENT.md
- Add to Testing Requirements section's documentation checklist

**User workflow to promote:**
```bash
# Step 1: Preview
mnemonic migrate --dry-run

# Step 2: Execute if happy with preview
mnemonic migrate
```

Same applies to MCP: encourage users to call `execute_migration` with `dryRun: true` first.

## Architecture decisions worth keeping

**Migration is explicit, not automatic:**
Users control when migration happens. This prevents surprises during upgrades and lets users review changes before applying them.

**On-the-fly reading vs explicit migration:**
- On-the-fly: For additive changes, parse old notes with defaults
- Explicit migration: For structural changes (renames, required fields)
- Don't auto-upgrade notes during read (breaks read-only expectations)

**Git as safety net:**
- Auto-commit provides undo capability (git revert)
- But dry-run is still strongly encouraged (better UX)
- Both approaches complement each other

## Files touched

```
src/
  config.ts              # Added schemaVersion: "1.0"
  index.ts               # CLI + MCP tool registrations
  migration.ts           # New migration framework
  storage.ts             # Added memoryVersion support

tests/
  migration.test.ts      # New test file (13 tests)

.mnemonic/notes/
  mnemonic-migration-strategy-7f2e8c3d.md    # Implementation details

Documentation:
  README.md              # Added list_migrations, execute_migration
  AGENT.md               # Added tools, testing requirements, docs checklist
  PLAN.md                # Marked section as implemented
```

## Next steps for future migrations

**When adding a new migration:**
1. Create migration function in `src/migration.ts`
2. Register with `migrator.registerMigration()`
3. Set min/max schema version constraints
4. Write comprehensive tests
5. Dogfood on mnemonic's own vault
6. Document in memory notes
7. Bump schema version if needed

**When adding new tool:**
1. Implement tool in `src/index.ts`
2. Add to README.md Tools table (alphabetical order)
3. Add to AGENT.md Tools table (alphabetical order)
4. Document parameters in AGENT.md
5. Add tests if tool modifies data
6. Update AGENT.md Testing Requirements section

This sets the foundation for schema evolution without breaking users' vaults. The migration infrastructure is now proven and ready for future format changes.
