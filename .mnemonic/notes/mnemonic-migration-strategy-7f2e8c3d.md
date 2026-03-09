---
title: Migration strategy and schema versioning decisions for mnemonic
tags:
  - architecture
  - migration
  - schema
  - decisions
  - breaking-changes
lifecycle: permanent
createdAt: '2026-03-08T01:27:30.000Z'
updatedAt: '2026-03-08T01:27:30.000Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: relates-to
memoryVersion: 1
---
# Migration Strategy Implementation

## Decision: Start with explicit schema versioning even pre-release

**Rationale**: Even though mnemonic is pre-release (v0.1.0), we implemented explicit schema versioning and migration infrastructure immediately. This forces us to dogfood the migration process before users adopt it widely.

**Key aspects**:
- Schema version starts at "1.0" (vault-level migration system version)
- Notes get `memoryVersion: 1` field in frontmatter (note format version)
- Config tracks `schemaVersion` in config.json
- Both project vaults and main vault participate in migrations

## Versioning scheme clarification

Two separate but related version numbers:

**`schemaVersion` (in config.json)**: Semver string (1.0, 1.1, 2.0)
- Tracks the migration system and overall vault schema
- Updated when new migration infrastructure is added
- Example: Adding `list_migrations` tool → bump to "1.1"

**`memoryVersion` (in note frontmatter)**: Integer (0, 1, 2)
- Tracks individual note format changes
- Updated when note structure changes (new fields, renamed fields)
- Notes can have different versions in the same vault (mixed-version support)
- Example: Adding `priority` field → new notes get `memoryVersion: 2`

## Migration strategies implemented

### 1. On-the-fly forward compatibility (for additive changes)
- Old notes load successfully with defaults for new fields
- Example: `parseNote()` treats missing `memoryVersion` as `0`
- New notes automatically get `memoryVersion: 1`

### 2. Explicit migration command (for structural changes)
- CLI command: `mnemonic migrate [--dry-run] [--cwd=<path>]`
- MCP tools: `list_migrations` and `execute_migration`
- All migrations are explicitly named and versioned
- Dry-run mode shows what would change

### 3. Version tracking at two levels
- **Note level**: `memoryVersion` in frontmatter (for note format changes)
- **Vault level**: `schemaVersion` in config.json (for cross-note changes)

## First migration: v0.1.0-backfill-memory-versions

**What it does**: Adds `memoryVersion: 1` to all existing notes that lack this field.

**Why this migration exists**: Pre-v0.2.0 notes don't have version markers. This migration backfills them so all notes are explicitly versioned.

**Process used**: 
1. Identified all 18 notes in mnemonic's project vault
2. Ran migration in dry-run mode to verify changes
3. Executed actual migration, modifying all 18 notes
4. Verified all notes now have `memoryVersion: 1`

## Tradeoffs made

**Starting at schema version 0.1**:
- ✅ Forces us through migration process during development
- ✅ Validates tooling before users depend on it
- ✅ Establishes pattern for future breaking changes
- ❌ Extra work for pre-release software
- ❌ Could have delayed until v0.2.0

**Version in every note** (not just config):
- ✅ Notes can be migrated individually
- ✅ Project vaults with mixed client versions work
- ✅ Self-documenting: each note shows its format
- ❌ Frontmatter is slightly more verbose
- ❌ Changing version requires rewriting all notes

**Explicit migration command vs automatic**:
- ✅ User controls when migration happens
- ✅ Can backup/commit before migrating
- ✅ Dry-run mode builds confidence
- ❌ Requires user action (not zero-touch)
- ❌ Some users may delay migration

## Testing approach

**Migration framework tests** (src/migration.test.ts):
- Version comparison logic for semantic versioning
- Migration detection based on schema version
- Dry-run vs execute mode behavior
- Error handling for malformed notes
- Project vault vs main vault selection

**Integration testing**:
- Migrated mnemonic's own `.mnemonic/` vault as dogfooding
- Verified all 18 notes updated correctly
- Validated migration is idempotent (re-running doesn't change already-migrated notes)

## Dry-run workflow (strongly encouraged)

**Safety net: automatic git commits**
- Migrations auto-commit modified notes
- Changes are pushed after commit
- Users can `git revert` if something goes wrong

**Why dry-run is still strongly recommended**:
- Shows exactly what will change before committing
- Builds confidence in the migration process
- Easier to review than reading git diff
- No risk of accidentally running migration

**CLI encourages dry-run first**:
```bash
# Step 1: Preview (shows counts and specific files)
mnemonic migrate --dry-run

# Step 2: Execute (auto-commits and pushes)
mnemonic migrate
```

**Even with auto-commit, always use --dry-run first**
- Auto-commit is a safety net, not a replacement for preview
- Two-step workflow prevents accidents
- Help text explicitly warns users

## Auto-commit behavior

**What gets committed:**
- Only files modified by the migration (tracked via `modifiedNoteIds`)
- Does NOT commit unrelated uncommitted changes in the vault
- Commit message includes migration name, count of modified/processed notes

**What does NOT get committed:**
- Unrelated markdown changes in notes directory
- Changes to config.json (unless migration specifically modifies it)
- Changes to embeddings (gitignored anyway)

**Failure handling:**
- Commit failures are warnings, not errors
- Migration succeeds even if commit fails
- Users can manually commit if auto-commit fails

## Future migration patterns

The infrastructure supports:

1. **Backfill migrations** (like v0.1.0): add missing fields to old notes
2. **Transform migrations**: rename fields, restructure data
3. **Cleanup migrations**: remove deprecated fields
4. **Multi-vault migrations**: update project vaults and main vault together

Each migration should:
- Have clear min/max version constraints
- Support dry-run mode
- Report detailed statistics
- Be atomic per vault (can fail one vault, succeed in others)

## Commands used

```bash
# Get help (shows dry-run workflow)
node build/index.js migrate --help

# List available migrations
node build/index.js migrate --list

# Step 1: Preview what would change
node build/index.js migrate --dry-run
node build/index.js migrate --dry-run --cwd=/path/to/project

# Step 2: Execute migration (only after reviewing dry-run output)
node build/index.js migrate
node build/index.js migrate --cwd=/path/to/project

# Or via MCP:
# - list_migrations: show pending migrations
# - execute_migration: run a specific migration (supports dryRun param)
```

## Next steps

- [ ] Bump schema version to 0.2 after completing v0.2.0 features
- [ ] Document migration process in user-facing README
- [ ] Add migration notes to release notes
- [ ] Consider CI/automated migration checks
- [ ] Monitor how users handle migrations in the wild
