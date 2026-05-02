---
title: 'Plan: Split index.ts into modular structure'
tags:
  - workflow
  - plan
  - refactoring
lifecycle: temporary
createdAt: '2026-05-02T06:10:17.697Z'
updatedAt: '2026-05-02T06:10:30.750Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-index-ts-dependency-analysis-for-modular-extraction-07f545d4
    type: derives-from
  - id: request-split-index-ts-into-modular-structure-cf87b146
    type: follows
memoryVersion: 1
---
## Plan: Split index.ts into Modular Structure

### Phase 1: ServerContext + Extract Helpers

- [ ] Create `src/server-context.ts` with `ServerContext` interface and `createServerContext()` factory
- [ ] Move `slugify`, `makeId`, `projectParam`, `describeLifecycle`, `formatNote`, `formatTemporalHistory`, `formatRelationshipPreview`, `toRecallFreshness`, `toRecallRankBand`, `formatRetrievalEvidenceHint`, `describeProject`, `formatProjectIdentityText` to `src/helpers/index.ts`
- [ ] Move `extractSummary`, `CommitBodyOptions`, `formatCommitBody`, `formatAskForWriteScope`, `formatAskForProtectedBranch`, `formatProtectedBranchBlocked`, `shouldBlockProtectedBranchCommit`, `wouldRelationshipCleanupTouchProjectVault` to `src/helpers/git-commit.ts`
- [ ] Move `embedTextForNote`, `embedMissingNotes`, `backfillEmbeddingsAfterSync`, `removeStaleEmbeddings` to `src/helpers/embed.ts`
- [ ] Move `resolveDurability`, `buildPersistenceStatus`, `buildMutationRetryContract`, `formatRetrySummary`, `formatPersistenceSummary`, `getMutationPushMode`, `pushAfterMutation` to `src/helpers/persistence.ts`
- [ ] Move `storageLabel`, `vaultMatchesStorageScope`, `collectVisibleNotes`, `formatListEntry`, `formatProjectPolicyLine`, `moveNoteBetweenVaults`, `removeRelationshipsToNoteIds`, `addVaultChange`, `ROLE_LIFECYCLE_DEFAULTS`, `projectNotFoundResponse` to `src/helpers/vault.ts`
- [ ] Move `resolveProject`, `toProjectRef`, `noteProjectRef`, `resolveProjectIdentityForCwd`, `resolveWriteVault`, `ensureBranchSynced` to `src/helpers/project.ts`
- [ ] Move `SearchScope`, `StorageScope`, `NoteEntry` types to appropriate location
- [ ] Update all imports in `index.ts` to use new modules
- [ ] Verify: `tsc --noEmit` passes, all tests pass

### Phase 2: Extract Tool Handlers

- [ ] Move `buildRecallCandidateContext`, `collectLexicalRescueCandidates` + DiscoverTagStat + tokenize helpers to `src/tools/recall-helpers.ts`
- [ ] Move `detectDuplicates`, `findClusters`, `suggestMerges`, `loadEmbeddingsByNoteId`, `executeMerge`, `findExistingExecuteMergeTarget`, `pruneSuperseded`, `dryRunAll` to `src/tools/consolidate-helpers.ts`
- [ ] Create `registerDetectProjectTool(server, ctx)` in `src/tools/detect-project.ts`
- [ ] Create `registerGetProjectIdentityTool(server, ctx)` in `src/tools/get-project-identity.ts`
- [ ] Create `registerSetProjectIdentityTool(server, ctx)` in `src/tools/set-project-identity.ts`
- [ ] Create `registerMigrationTools(server, ctx)` in `src/tools/migration.ts`
- [ ] Create `registerRememberTool(server, ctx)` in `src/tools/remember.ts`
- [ ] Create `registerPolicyTools(server, ctx)` in `src/tools/policy.ts`
- [ ] Create `registerRecallTool(server, ctx)` in `src/tools/recall.ts`
- [ ] Create `registerUpdateTool(server, ctx)` in `src/tools/update.ts`
- [ ] Create `registerForgetTool(server, ctx)` in `src/tools/forget.ts`
- [ ] Create `registerGetTool(server, ctx)` in `src/tools/get.ts`
- [ ] Create `registerWhereIsMemoryTool(server, ctx)` in `src/tools/where-is-memory.ts`
- [ ] Create `registerListTool(server, ctx)` in `src/tools/list.ts`
- [ ] Create `registerDiscoverTagsTool(server, ctx)` in `src/tools/discover-tags.ts`
- [ ] Create `registerRecentMemoriesTool(server, ctx)` in `src/tools/recent-memories.ts`
- [ ] Create `registerMemoryGraphTool(server, ctx)` in `src/tools/memory-graph.ts`
- [ ] Create `registerProjectMemorySummaryTool(server, ctx)` in `src/tools/project-memory-summary.ts`
- [ ] Create `registerSyncTool(server, ctx)` in `src/tools/sync.ts`
- [ ] Create `registerMoveMemoryTool(server, ctx)` in `src/tools/move-memory.ts`
- [ ] Create `registerRelateTool(server, ctx)` in `src/tools/relate.ts`
- [ ] Create `registerUnrelateTool(server, ctx)` in `src/tools/unrelate.ts`
- [ ] Create `registerConsolidateTool(server, ctx)` in `src/tools/consolidate.ts`
- [ ] Verify: `tsc --noEmit` passes, all tests pass

### Phase 3: Extract CLI Commands, Prompts, Startup

- [ ] Move CLI migrate command to `src/cli/migrate.ts`
- [ ] Move CLI import-claude-memory command to `src/cli/import-claude-memory.ts`
- [ ] Move prompt registrations to `src/prompts.ts`
- [ ] Move `warnAboutPendingMigrationsOnStartup` and startup logic to `src/startup.ts`
- [ ] Verify: `tsc --noEmit` passes, all tests pass

### Phase 4: Slim index.ts to Pure Wiring

- [ ] Reduce `index.ts` to: imports, ServerContext creation, tool registration calls, server start
- [ ] Target: ~100-150 lines
- [ ] Verify: `tsc --noEmit` passes, all tests pass
- [ ] Final review of module boundaries and naming
