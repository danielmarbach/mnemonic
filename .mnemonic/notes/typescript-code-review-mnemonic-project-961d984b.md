---
title: TypeScript Code Review — Mnemonic Project
tags:
  - typescript
  - code-review
  - type-safety
  - security
  - performance
lifecycle: permanent
createdAt: '2026-05-02T04:20:54.784Z'
updatedAt: '2026-05-02T04:20:54.784Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Review Workflow

Followed `skills/typescript-code-review/SKILL.md` workflow (Steps 1-7) with reference documents for impossible states, antipatterns, security, and performance.

## tsconfig.json Assessment

`strict: true` enabled (includes `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`). **Missing**: `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`.

## Critical Issues 🔴

### C1: Unsafe `as` casts on `JSON.parse` results (HIGH)

- `storage.ts:247` — `JSON.parse(raw) as EmbeddingRecord` with no runtime validation
- `storage.ts:281` — `JSON.parse(raw) as NoteProjection` with no runtime validation
- `storage.ts:372` — `parsed.data["relatedTo"] as Relationship[] | undefined` — highest risk: malformed frontmatter produces silently corrupted data
- **Fix**: Add Zod validation schemas for deserialized data at trust boundaries

### C2: `noUncheckedIndexedAccess` not enabled (HIGH)

- ~40+ array/map indexing operations assume non-nullable results
- `git.ts:508` — tuple destructuring from `split` without length validation
- **Fix**: Enable `noUncheckedIndexedAccess` in tsconfig.json

### C3: MCP tool `id` parameter lacks format validation at API layer (MEDIUM-HIGH)

- `index.ts` — note IDs validated only at storage path construction, not at MCP boundary
- `remoteName` parameter (`z.string().min(1)`) allows git argument-like values (e.g., `--global`)
- **Fix**: Add `z.string().regex(/^[a-zA-Z0-9_.-]+$/)` to `remoteName` and `/^[a-zA-Z0-9_-]+$/` to `id`

## Important Improvements 🟡

### I1: Branded types for domain primitives

- `Note.id` is `string` — should be branded `MemoryId`
- `ProjectInfo.id` is `string` — should be branded `ProjectId`
- `EmbeddingRecord.model` is `string` — should be `EmbeddingModelId`
- Timestamp fields (`createdAt`, `updatedAt`) are `string` — should be branded `ISO8601DateString`
- `Vault.vaultFolderName` is `string` — constrained set deserves branded type

### I2: Discriminated unions with `never` for mutual exclusion

- `CommitResult` / `PushResult` — `status` field is discriminator but `error`/`reason` are optional regardless
- `SyncGitError` — `conflictFiles` is `string[] | undefined` but only meaningful when `isConflict === true`
- `MutationRetryContract` — `instructions` shape depends on `recovery.kind`

### I3: Missing exhaustive `never` checks

- `recall.ts:449-460` — `getRelationshipMultiplier` switch has no `default: never` branch
- `config.ts:50-59` — `normalizeMutationPushMode` switch falls through to default

### I4: Type/runtime value drift risk

- `RelationshipType` defined separately in `storage.ts` and Zod enum in `structured-content.ts`
- `MergeRisk` defined identically in both `consolidate.ts` and `structured-content.ts`
- `Confidence` type and Zod enum defined separately
- `ChangeCategory` in `temporal-interpretation.ts` repeated in Zod schema
- **Fix**: Single-source each union from a `const` array + `as const` + `typeof X[number]`

### I5: Missing `as const` on object/array literals

- `git-constants.ts:1` — `metadataPrefixes` is `string[]`, should be `as const`
- `index.ts:1440` — `ROLE_LIFECYCLE_DEFAULTS` should be `as const satisfies Record<NoteRole, NoteLifecycle>`
- `recall.ts:23-30` — `WORKFLOW_ROLE_BOOSTS` should preserve literal keys with `as const`
- `recall.ts:89-100` — `TEMPORAL_QUERY_HINTS` should be `as const`

### I6: Performance — sequential awaits that should be parallelized

- `index.ts:2576` — vault embedding backfills run sequentially
- `index.ts:558-583` — main + project vault sync are sequential
- `index.ts:1410-1429` — relationship removal is sequential per vault
- `storage.ts:91-115` — staged file renames are sequential
- `storage.ts:159-181` — note/embedding/projection deletions are sequential
- `index.ts:419-421` — imported notes written sequentially

### I7: Performance — O(n²) algorithms

- `role-suggestions.ts:40-61` — `buildRoleSuggestionContext` scans all notes per note for inbound references
- `recall.ts:297-318` — per-candidate IDF recomputation

### I8: Performance — memory concerns

- `index.ts:1246-1307` — `collectVisibleNotes` loads ALL note contents into memory
- `storage.ts:183-201` — `listNotes` loads all notes via `Promise.all`
- `config.ts:190-236` — `MnemonicConfigStore.readAll()` reads config file on every call (no caching)

### I9: Bare `catch {}` blocks silently swallow errors (~15 instances)

- `git.ts:178,262,283,419,457,468,520` — git operations return empty on error
- `config.ts:176,233` — config read failures silently return defaults
- `vault.ts:264,291,302` — directory/git operations return empty/null
- **Fix**: Add `debugLog()` calls or create a `tryOr` utility that logs at debug level

### I10: Magic numbers needing named constants

- `auto-relate.ts:79-83` — scoring weights `0.45`, `0.2`, `0.05`, `0.32`
- `project-introspection.ts:134,139,188,256` — thresholds `30`, `0.1`, `0.4`, `0.2`, `1.2`, `3`
- `recall.ts:207` — `3.5` RRF scaling factor
- `index.ts:665-669` — freshness thresholds `1`, `7`, `31`

### I11: Functions with 5+ positional parameters

- `collectLexicalRescueCandidates` — 7 positional parameters
- `recordSessionNoteAccess` — 5 parameters
- `collectVisibleNotes` — 5 parameters
- `getSessionCachedProjectionTokens` — 5 parameters

## Suggestions 🔵

- Add `import type` for `Note` in `index.ts:373` (inline `import("./storage.js").Note`)
- Encapsulate module-level mutable singletons (`sessionCaches`, `mutationLocks`, `branchHistory`) in classes
- Use `#` private fields for `Storage.stagedNotesDir` and `stagedDeletedNoteIds`
- Add size limits (`.max()`) to `title` and `content` Zod schemas for defense in depth
- Sanitize git error messages before including in MCP responses
- Validate `cwd` parameter to ensure it resolves to a real project directory
- Split `index.ts` (4000+ lines) into separate handler modules
- Consider streaming/pagination for `listNotes` and `collectVisibleNotes`
- Cache parsed config in `MnemonicConfigStore`

## Positive Observations ✅

- `import type` used consistently throughout
- `as const satisfies` pattern used correctly for `NOTE_LIFECYCLES`, `NOTE_ROLES`, `NOTE_IMPORTANCE_LEVELS`
- Exhaustive `never` checks in `index.ts:1157` and `1213`
- Custom error classes (`GitOperationError`, `MarkdownLintError`)
- `getErrorMessage(err: unknown)` utility for safe error handling
- SSRF protection in `embeddings.ts` (`validateOllamaUrl` checks localhost/private networks)
- `validateNoteId` regex prevents path traversal
- `execFile` (not `exec`) used for git commands — no shell injection
- No hardcoded secrets found
- Constants like `RRF_K`, `MS_PER_DAY`, `LEXICAL_RESCUE_CANDIDATE_LIMIT` are well-named
- Fail-soft pattern intentionally applied for MCP server resilience
- `readonly` on class fields where appropriate
- Named scoring weights like `PROJECT_SCOPE_BOOST`, `CANONICAL_HYBRID_WEIGHT`
