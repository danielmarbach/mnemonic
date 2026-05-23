import { z } from "zod";
import { CHANGE_CATEGORIES } from "./temporal-interpretation.js";
import { NOTE_ROLES, RELATIONSHIP_TYPES } from "./storage.js";
import type { NoteLifecycle, NoteRole, RelationshipType } from "./storage.js";
import { MERGE_RISKS } from "./consolidate.js";
import type { MergeRisk } from "./consolidate.js";

export const CONSOLIDATE_CLASSIFICATIONS = ["lineage", "duplicate-pressure", "unique-evidence-risk", "supersession-pressure"] as const;
export type ConsolidateClassification = typeof CONSOLIDATE_CLASSIFICATIONS[number];

export const CONSOLIDATE_MAINTENANCE_WARNING_CODES = ["stale-temporary-notes", "superseded-prune-candidates"] as const;

export const PROJECT_MAINTENANCE_WARNING_CODES = ["stale-temporary-notes", "superseded-prune-candidates", "weak-orientation-anchors"] as const;
export const PROJECT_MAINTENANCE_WARNING_SEVERITIES = ["info", "warning"] as const;

export interface PersistenceStatus {
  notePath: string;
  embeddingPath: string;
  embedding: {
    status: "written" | "skipped";
    model: string;
    reason?: string;
  };
  git: {
    commit: "committed" | "skipped" | "failed";
    push: "pushed" | "skipped" | "failed";
    commitMessage?: string;
    commitBody?: string;
    /** Reason when commit is skipped: "git-disabled" | "no-changes" */
    commitReason?: string;
    /** Error when commit failed. Source depends on commitOperation. */
    commitError?: string;
    /** Which operation failed when commit is "failed". "add" = files never staged. */
    commitOperation?: "add" | "commit";
    /** Reason when push is skipped */
    pushReason?: string;
    /** Error when push failed. */
    pushError?: string;
  };
  retry?: MutationRetryContract;
  durability: "local-only" | "committed" | "pushed";
}

export interface MutationRetryContract {
  recovery: {
    kind: "manual-exact-git-recovery" | "rerun-tool-call-serial" | "no-manual-recovery";
    allowed: boolean;
    reason: string;
  };
  attemptedCommit: {
    subject: string;
    body?: string;
    files: string[];
    cwd?: string;
    vault: string;
    error: string;
    /** Which operation failed. "add" = files never staged. */
    operation?: "add" | "commit";
  };
  mutationApplied: boolean;
  retrySafe: boolean;
  rationale: string;
  instructions: {
    sourceOfTruth: "attemptedCommit" | "tool-response";
    useExactSubject: boolean;
    useExactBody: boolean;
    useExactFiles: boolean;
    forbidInferenceFromHistory: boolean;
    forbidInferenceFromTitleOrSummary: boolean;
    forbidParallelSameVaultRetries: boolean;
    preferToolReconciliation: boolean;
    rerunSameToolCallSerially: boolean;
  };
}

export interface StructuredResponse {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}

export interface ProjectRef {
  id: string;
  name: string;
}

export type RememberLintErrorResult = {
  action: "lint_error";
  tool: "remember";
  issues: string[];
};

export type UpdateLintErrorResult = {
  action: "lint_error";
  tool: "update";
  issues: string[];
};

export interface RememberResult extends Record<string, unknown> {
  action: "remembered";
  id: string;
  title: string;
  project?: { id: string; name: string };
  scope: "project" | "global";
  vault: string;
  tags: string[];
  lifecycle: NoteLifecycle;
  timestamp: string;
  persistence: PersistenceStatus;
}

export interface RecallResult extends Record<string, unknown> {
  action: "recalled";
  query: string;
  scope: "project" | "global" | "all";
  recallScopeNoteCount?: number;
  diversity?: RecallDiversity;
  retrievalCoverage?: RecallRetrievalCoverage;
  results: Array<{
    id: string;
    title: string;
    score: number;
    boosted: number;
    project?: ProjectRef;
    vault: string;
    tags: string[];
    lifecycle: NoteLifecycle;
    role?: NoteRole;
    updatedAt: string;
    provenance?: Provenance;
    confidence?: Confidence;
    signalStrength?: number;
    history?: Array<{
      commitHash: string;
      timestamp: string;
      message: string;
      summary?: string;
      stats?: {
        additions: number;
        deletions: number;
        filesChanged: number;
        changeType: "metadata-only change" | "minor edit" | "substantial update";
      };
      changeCategory?: "create" | "refine" | "expand" | "clarify" | "connect" | "restructure" | "reverse" | "unknown";
      changeDescription?: string;
    }>; 
    historySummary?: string;
    relationships?: RelationshipPreview;
    retrievalEvidence?: RetrievalEvidence;
  }>;
}

export interface RecallDiversity {
  themeCount: number;
  roleMix: Partial<Record<NoteRole, number>>;
  lifecycleMix: Partial<Record<NoteLifecycle, number>>;
}

export interface RecallRetrievalCoverage {
  anchorsInResults: number;
  highPriorityAnchorsTotal: number;
  fraction: number;
  missingAnchors: Array<{ id: string; title: string }>;
}

export type RetrievalEvidenceChannel = "semantic" | "lexical" | "graph" | "temporal-boost" | "canonical" | "rescue";
export type RetrievalEvidenceRankBand = "top3" | "top10" | "lower";
export type RetrievalEvidenceFreshness = "today" | "thisWeek" | "thisMonth" | "older";

export interface RetrievalEvidence {
  channels: RetrievalEvidenceChannel[];
  rankBand: RetrievalEvidenceRankBand;
  projectRelevant: boolean;
  freshness: RetrievalEvidenceFreshness;
  superseded: boolean;
  supersededBy?: string;
  supersededCount?: number;
}

export interface ListResult extends Record<string, unknown> {
  action: "listed";
  count: number;
  scope: "project" | "global" | "all";
  storedIn: "project-vault" | "main-vault" | "any" | "attached";
  project?: ProjectRef;
  notes: Array<{
    id: string;
    title: string;
    project?: ProjectRef;
    tags: string[];
    lifecycle: NoteLifecycle;
    role?: NoteRole;
    vault: string;
    updatedAt: string;
    hasRelated?: boolean;
  }>;
  options?: {
    includeRelations?: boolean;
    includePreview?: boolean;
    includeStorage?: boolean;
    includeUpdated?: boolean;
  };
}

export interface GetResult extends Record<string, unknown> {
  action: "got";
  count: number;
  notes: Array<{
    id: string;
    title: string;
    content: string;
    project?: ProjectRef;
    tags: string[];
    lifecycle: NoteLifecycle;
    role?: NoteRole;
    alwaysLoad?: boolean;
    relatedTo?: Array<{ id: string; type: RelationshipType }>;
    createdAt: string;
    updatedAt: string;
    vault: string;
    relationships?: RelationshipPreview;
  }>;
  notFound: string[];
}

export interface RelateResult extends Record<string, unknown> {
  action: "related" | "unrelated";
  fromId: string;
  toId: string;
  type: RelationshipType;
  bidirectional: boolean;
  notesModified: string[];
  retry?: MutationRetryContract;
}

export interface MoveResult extends Record<string, unknown> {
  action: "moved";
  id: string;
  fromVault: string;
  toVault: string;
  projectAssociation: string;
  title: string;
  metadataRewritten?: boolean;
  persistence: PersistenceStatus;
}

export interface UpdateResult extends Record<string, unknown> {
  action: "updated";
  id: string;
  title: string;
  fieldsModified: string[];
  timestamp: string;
  project?: ProjectRef;
  lifecycle: NoteLifecycle;
  role?: NoteRole;
  lintWarnings?: string[];
  persistence: PersistenceStatus;
}

export interface ForgetResult extends Record<string, unknown> {
  action: "forgotten";
  id: string;
  title: string;
  project?: ProjectRef;
  relationshipsCleaned: number;
  vaultsModified: string[];
  retry?: MutationRetryContract;
}

export type SyncVaultGitError =
  | { phase: "fetch" | "pull" | "push"; message: string; isConflict: false }
  | { phase: "pull"; message: string; isConflict: true; conflictFiles: string[] };

export interface SyncResult extends Record<string, unknown> {
  action: "synced";
  vaults: Array<{
    vault: "main" | "project" | "attached";
    hasRemote: boolean;
    pulled: number;
    deleted: number;
    pushed: number;
    embedded: number;
    /** Embedding failures — note ids that could not be re-embedded, with error reasons */
    failed: Array<{ id: string; error: string }>;
    /** Set when a git operation (fetch/pull/push) failed during sync */
    gitError?: SyncVaultGitError;
    /** For attached vaults: the project slug identifying the attachment */
    attachedSlug?: string;
  }>;
}

export interface AddAttachmentResult extends Record<string, unknown> {
  action: "attachment_added";
  project: { id: string; name: string };
  attachment: {
    projectSlug: string;
    projectName: string;
    localPath: string;
    vaultFolder: string;
    enabled: boolean;
    branch: string;
    branchTipHash: string;
  };
  warnings?: string[];
  retry?: MutationRetryContract;
}

export interface RemoveAttachmentResult extends Record<string, unknown> {
  action: "attachment_removed";
  project: { id: string; name: string };
  removedAttachment: {
    projectSlug: string;
    projectName: string;
    localPath: string;
    vaultFolder: string;
    branch: string;
  };
  retry?: MutationRetryContract;
}

export interface ListAttachmentsResult extends Record<string, unknown> {
  action: "attachments_listed";
  project: { id: string; name: string };
  attachments: Array<{
    projectSlug: string;
    projectName: string;
    localPath: string;
    vaultFolder: string;
    enabled: boolean;
    branch: string;
    branchTipHash: string;
    pathExists: boolean;
    noteCount: number;
  }>;
  maxAttachmentsPerProject: number;
}

export interface SetAttachmentEnabledResult extends Record<string, unknown> {
  action: "attachment_enabled_set";
  project: { id: string; name: string };
  attachment: {
    projectSlug: string;
    projectName: string;
    enabled: boolean;
    branch: string;
  };
  retry?: MutationRetryContract;
}

export interface SetAttachmentBranchResult extends Record<string, unknown> {
  action: "attachment_branch_set";
  project: { id: string; name: string };
  attachment: {
    projectSlug: string;
    projectName: string;
    localPath: string;
    vaultFolder: string;
    enabled: boolean;
    branch: string;
    branchTipHash: string;
  };
  warnings?: string[];
  retry?: MutationRetryContract;
}

export interface ReindexResult extends Record<string, unknown> {
  action: "reindexed";
  vaults: Array<{
    vault: "main" | "project";
    rebuilt: number;
    failed: Array<{ id: string; error: string }>;
  }>;
}

export interface ConsolidateResult extends Record<string, unknown> {
  action: "consolidated";
  strategy: string;
  project?: ProjectRef;
  notesProcessed: number;
  notesModified: number;
  warnings?: string[];
  maintenanceWarnings?: ConsolidateMaintenanceWarning[];
  themeGroups?: Array<{ name: string; count: number; examples: string[] }>;
  relationshipClusters?: Array<{ hub: { id: string; title: string }; notes: { id: string; title: string }[] }>;
  duplicatePairs?: ConsolidateDuplicatePairEvidence[];
  mergeSuggestions?: ConsolidateMergeSuggestionEvidence[];
  executeMergeEvidence?: ConsolidateExecuteMergeEvidence;
  persistence?: PersistenceStatus;
  retry?: MutationRetryContract;
}



export interface ConsolidateNoteMergeEvidence {
  id: string;
  title: string;
  lifecycle: NoteLifecycle;
  role?: NoteRole;
  ageDays: number;
  superseded: boolean;
  supersededBy?: string;
  supersededCount?: number;
  relatedCount: number;
  classification?: ConsolidateClassification;
  warnings?: string[];
  mergeRisk: MergeRisk;
}

export interface ConsolidateMaintenanceWarning {
  code: string;
  severity: "info" | "warning";
  message: string;
  count?: number;
  sampleNotes?: Array<{ id: string; title: string }>;
  suggestedAction: string;
}

export interface ConsolidateDuplicatePairEvidence {
  similarity: number;
  noteA: ConsolidateNoteMergeEvidence;
  noteB: ConsolidateNoteMergeEvidence;
  warnings?: string[];
  mergeRisk: MergeRisk;
}

export interface ConsolidateMergeSuggestionEvidence {
  targetTitle: string;
  sourceIds: string[];
  mode: "supersedes" | "delete";
  notes: ConsolidateNoteMergeEvidence[];
  warnings?: string[];
  mergeRisk: MergeRisk;
}

export interface ConsolidateExecuteMergeEvidence {
  notes: ConsolidateNoteMergeEvidence[];
  warnings?: string[];
  mergeRisk: MergeRisk;
}

export interface ProjectIdentityResult extends Record<string, unknown> {
  action: "project_identity_set" | "project_identity_shown" | "project_identity_detected";
  project?: { id: string; name: string; source: string; remoteName?: string };
  identityOverride?: { remoteName: string; updatedAt: string };
  defaultProject?: { id: string; name: string; remoteName?: string };
  retry?: MutationRetryContract;
}

export interface MigrationListResult extends Record<string, unknown> {
  action: "migration_list";
  vaults: Array<{
    path: string;
    type: "main" | "project";
    version: string;
    pending: number;
  }>;
  available: Array<{ name: string; description: string }>;
  totalPending: number;
}

export interface MigrationExecuteResult extends Record<string, unknown> {
  action: "migration_executed";
  migration: string;
  dryRun: boolean;
  vaultsProcessed: number;
  vaultResults: Array<{
    path: string;
    notesProcessed: number;
    notesModified: number;
    errors: Array<{ noteId: string; error: string }>;
    warnings: string[];
  }>;
}

export interface PolicyResult extends Record<string, unknown> {
  action: "policy_set" | "policy_shown";
  project: { id: string; name: string };
  defaultScope?: string;
  consolidationMode?: string;
  protectedBranchPatterns?: string[];
  protectedBranchBehavior?: string;
  maxAttachmentsPerProject?: number;
  updatedAt?: string;
  retry?: MutationRetryContract;
}

export interface WhereIsResult extends Record<string, unknown> {
  action: "located";
  id: string;
  title: string;
  project?: ProjectRef;
  vault: string;
  updatedAt: string;
  relatedCount: number;
}

export interface MemoryGraphResult extends Record<string, unknown> {
  action: "graph_shown";
  project?: ProjectRef;
  nodes: Array<{
    id: string;
    title: string;
    edges: Array<{ toId: string; type: RelationshipType }>;
  }>;
  limit: number;
  truncated: boolean;
}

export interface RecentResult extends Record<string, unknown> {
  action: "recent_shown";
  project?: ProjectRef;
  count: number;
  limit: number;
  notes: Array<{
    id: string;
    title: string;
    project?: ProjectRef;
    tags: string[];
    lifecycle: NoteLifecycle;
    vault: string;
    updatedAt: string;
    preview?: string;
  }>;
}

export interface ThemeSection {
  count: number;
  examples: Array<{
    id: string;
    title: string;
    updatedAt: string;
  }>;
}

export interface AnchorNote {
  id: string;
  title: string;
  centrality: number;
  connectionDiversity: number;
  updatedAt: string;
}

export interface RecentNote {
  id: string;
  title: string;
  updatedAt: string;
  theme: string;
}

export interface RelatedGlobalNote {
  id: string;
  title: string;
  similarity: number;
  preview: string;
}

export interface OrientationNote {
  id: string;
  title: string;
  rationale: string;
  provenance?: Provenance;
  confidence?: Confidence;
  relationships?: RelationshipPreview;
}

export interface Provenance {
  lastUpdatedAt: string;
  lastCommitHash: string;
  lastCommitMessage: string;
  recentlyChanged: boolean;
}

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type Confidence = typeof CONFIDENCE_LEVELS[number];

export interface Orientation {
  primaryEntry: OrientationNote;
  suggestedNext: OrientationNote[];
  warnings?: string[];
}

export interface WorkingStateNote {
  id: string;
  title: string;
  updatedAt: string;
  rationale: string;
  preview: string;
  nextAction?: string;
}

export interface WorkingState {
  summary: string;
  recoveryHint: string;
  notes: WorkingStateNote[];
}

export type ProjectMaintenanceWarningCode = typeof PROJECT_MAINTENANCE_WARNING_CODES[number];
export type ProjectMaintenanceWarningSeverity = typeof PROJECT_MAINTENANCE_WARNING_SEVERITIES[number];

export interface ProjectMaintenanceWarning {
  code: ProjectMaintenanceWarningCode;
  severity: ProjectMaintenanceWarningSeverity;
  message: string;
  count?: number;
  sampleNotes?: Array<{ id: string; title: string }>;
  suggestedAction: string;
}

export interface ProjectSummaryNotes {
  total: number;
  projectVault: number;
  mainVault: number;
  privateProject: number;
}

export interface NoteProjection {
  noteId: string;
  title: string;
  summary: string;
  headings: string[];
  tags: string[];
  lifecycle?: string;
  updatedAt?: string;
  projectionText: string;
  generatedAt: string;
}

export interface ProjectSummaryResult extends Record<string, unknown> {
  action: "project_summary_shown";
  project: ProjectRef;
  notes: ProjectSummaryNotes;
  themes: Record<string, ThemeSection>;
  recent: RecentNote[];
  anchors: AnchorNote[];
  orientation: Orientation;
  maintenanceWarnings?: ProjectMaintenanceWarning[];
  workingState?: WorkingState;
  relatedGlobal?: {
    notes: RelatedGlobalNote[];
    computedAt: string;
  };
}

// ── Zod output schemas ────────────────────────────────────────────────────────

export const NoteIdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/, "Invalid note ID format");
export const RemoteNameSchema = z.string().regex(/^[a-zA-Z0-9_.-]+$/, "Invalid remote name format");
const _NoteLifecycle = z.enum(["temporary", "permanent"]);
const _NoteRole = z.enum(NOTE_ROLES);
const _RelationshipType = z.enum(RELATIONSHIP_TYPES);
const _MergeRisk = z.enum(MERGE_RISKS);
const _Confidence = z.enum(CONFIDENCE_LEVELS);
const _ChangeCategory = z.enum(CHANGE_CATEGORIES);
/**
 * Vault label used in structured output.
 * - "main-vault" for the main (global) vault.
 * - "project-vault" for the primary project vault (.mnemonic/).
 * - "sub-vault:.mnemonic-<name>" for submodule-specific project vaults.
 */
const _VaultLabel = z.string().regex(/^main-vault$|^project-vault$|^sub-vault:\.mnemonic-.+$|^attached:[a-z0-9][-a-z0-9]*\/\.mnemonic(-.+)?$/);
const ProjectRefSchema = z.object({ id: z.string(), name: z.string() });

export const RelatedNotePreviewSchema = z.object({
  id: z.string(),
  title: z.string(),
  projectId: z.string().optional(),
  theme: z.string().optional(),
  relationType: _RelationshipType.optional(),
  updatedAt: z.string(),
  confidence: _Confidence.optional(),
});

export const RelationshipPreviewSchema = z.object({
  totalDirectRelations: z.number(),
  shown: z.array(RelatedNotePreviewSchema),
  truncated: z.boolean(),
});

export const PersistenceStatusSchema = z.object({
  notePath: z.string(),
  embeddingPath: z.string(),
  embedding: z.object({
    status: z.enum(["written", "skipped"]),
    model: z.string(),
    reason: z.string().optional(),
  }),
  git: z.object({
    commit: z.enum(["committed", "skipped", "failed"]),
    push: z.enum(["pushed", "skipped", "failed"]),
    commitMessage: z.string().optional(),
    commitBody: z.string().optional(),
    commitReason: z.string().optional(),
    commitError: z.string().optional(),
    commitOperation: z.enum(["add", "commit"]).optional(),
    pushReason: z.string().optional(),
    pushError: z.string().optional(),
  }),
  retry: z.object({
    recovery: z.object({
      kind: z.enum(["manual-exact-git-recovery", "rerun-tool-call-serial", "no-manual-recovery"]),
      allowed: z.boolean(),
      reason: z.string(),
    }),
    attemptedCommit: z.object({
      subject: z.string(),
      body: z.string().optional(),
      files: z.array(z.string()),
      cwd: z.string().optional(),
      vault: _VaultLabel,
      error: z.string(),
      operation: z.enum(["add", "commit"]).optional(),
    }),
    mutationApplied: z.boolean(),
    retrySafe: z.boolean(),
    rationale: z.string(),
    instructions: z.object({
      sourceOfTruth: z.enum(["attemptedCommit", "tool-response"]),
      useExactSubject: z.boolean(),
      useExactBody: z.boolean(),
      useExactFiles: z.boolean(),
      forbidInferenceFromHistory: z.boolean(),
      forbidInferenceFromTitleOrSummary: z.boolean(),
      forbidParallelSameVaultRetries: z.boolean(),
      preferToolReconciliation: z.boolean(),
      rerunSameToolCallSerially: z.boolean(),
    }),
  }).optional(),
  durability: z.enum(["local-only", "committed", "pushed"]),
});

export const RememberResultSchema = z.object({
  action: z.literal("remembered"),
  id: z.string(),
  title: z.string(),
  project: ProjectRefSchema.optional(),
  scope: z.enum(["project", "global"]),
  vault: _VaultLabel,
  tags: z.array(z.string()),
  lifecycle: _NoteLifecycle,
  timestamp: z.string(),
  persistence: PersistenceStatusSchema,
});

export const RememberToolResultSchema = z.object({
  action: z.enum(["remembered", "lint_error"]).describe("Result variant: 'remembered' for success, 'lint_error' when unfixable markdown lint errors prevented storage."),
  tool: z.literal("remember").optional().describe("Present and set to 'remember' when action is lint_error."),
  id: z.string().optional().describe("Note id, present when action is remembered."),
  title: z.string().optional().describe("Note title, present when action is remembered."),
  project: ProjectRefSchema.optional().describe("Project reference, present when action is remembered."),
  scope: z.enum(["project", "global"]).optional().describe("Storage scope, present when action is remembered."),
  vault: _VaultLabel.optional().describe("Vault label, present when action is remembered."),
  tags: z.array(z.string()).optional().describe("Note tags, present when action is remembered."),
  lifecycle: _NoteLifecycle.optional().describe("Note lifecycle, present when action is remembered."),
  timestamp: z.string().optional().describe("ISO timestamp, present when action is remembered."),
  persistence: PersistenceStatusSchema.optional().describe("Git and embedding persistence status, present when action is remembered."),
  issues: z.array(z.string()).optional().describe("Unfixable markdown lint issues that prevented storage. Present when action is lint_error."),
}).superRefine((value, ctx) => {
  if (value.action === "remembered") {
    if (!value.id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["id"], message: "id is required when action=remembered" });
    if (!value.title) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["title"], message: "title is required when action=remembered" });
    if (!value.scope) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scope"], message: "scope is required when action=remembered" });
    if (!value.vault) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vault"], message: "vault is required when action=remembered" });
    if (!value.tags) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tags"], message: "tags is required when action=remembered" });
    if (!value.lifecycle) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lifecycle"], message: "lifecycle is required when action=remembered" });
    if (!value.timestamp) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["timestamp"], message: "timestamp is required when action=remembered" });
    if (!value.persistence) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["persistence"], message: "persistence is required when action=remembered" });
  }
  if (value.action === "lint_error") {
    if (value.tool !== "remember") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tool"], message: "tool must be remember when action=lint_error" });
    if (!value.issues) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["issues"], message: "issues is required when action=lint_error" });
  }
});

export const RecallResultSchema = z.object({
  action: z.literal("recalled"),
  query: z.string(),
  scope: z.enum(["project", "global", "all"]),
  recallScopeNoteCount: z.number().int().min(0).optional().describe("Total notes visible across all vaults for this recall scope. Use to decide whether to increase limit for small vaults."),
  diversity: z.object({
    themeCount: z.number().int().min(0).describe("Unique tag count across selected results"),
    roleMix: z.record(z.string(), z.number()).describe("Count of each NoteRole present in selected results"),
    lifecycleMix: z.record(z.string(), z.number()).describe("Count of each NoteLifecycle present in selected results"),
  }).optional().describe("Diversity metrics: gauge whether results span enough perspectives"),
  retrievalCoverage: z.object({
    anchorsInResults: z.number().int().min(0).describe("Number of high-priority anchors found in results"),
    highPriorityAnchorsTotal: z.number().int().min(0).describe("Total high-priority anchors in the project vault"),
    fraction: z.number().min(0).max(1).describe("Fraction of high-priority anchors present in results (0 when no anchors exist)"),
    missingAnchors: z.array(z.object({
      id: z.string(),
      title: z.string(),
    })).describe("Up to 5 high-priority anchors not in results, for follow-up recall"),
  }).optional().describe("How well results cover the project's most important notes. Only present when project context is available."),
  results: z.array(z.object({
    id: z.string(),
    title: z.string(),
    score: z.number(),
    boosted: z.number(),
    project: ProjectRefSchema.optional(),
    vault: _VaultLabel,
    tags: z.array(z.string()),
    lifecycle: _NoteLifecycle,
    role: _NoteRole.optional(),
    updatedAt: z.string(),
    provenance: z.object({
      lastUpdatedAt: z.string(),
      lastCommitHash: z.string(),
      lastCommitMessage: z.string(),
      recentlyChanged: z.boolean(),
    }).optional(),
    confidence: _Confidence.optional(),
    signalStrength: z.number().min(0).optional().describe("Composite quality signal (0-0.50). Higher = more structural support from role, centrality, lifecycle, and recency. Use alongside confidence."),
    history: z.array(z.object({
      commitHash: z.string(),
      timestamp: z.string(),
      message: z.string(),
      summary: z.string().optional(),
      stats: z.object({
        additions: z.number(),
        deletions: z.number(),
        filesChanged: z.number(),
        changeType: z.enum(["metadata-only change", "minor edit", "substantial update"]),
      }).optional(),
      changeCategory: _ChangeCategory.optional(),
      changeDescription: z.string().optional(),
    })).optional(),
    historySummary: z.string().optional(),
    relationships: RelationshipPreviewSchema.optional(),
    retrievalEvidence: z.object({
      channels: z.array(z.enum(["semantic", "lexical", "graph", "temporal-boost", "canonical", "rescue"])),
      rankBand: z.enum(["top3", "top10", "lower"]),
      projectRelevant: z.boolean(),
      freshness: z.enum(["today", "thisWeek", "thisMonth", "older"]),
      superseded: z.boolean(),
      supersededBy: z.string().optional(),
      supersededCount: z.number().int().optional(),
    }).optional(),
  })),
});

export const ListResultSchema = z.object({
  action: z.literal("listed"),
  count: z.number(),
  scope: z.enum(["project", "global", "all"]),
  storedIn: z.enum(["project-vault", "main-vault", "any", "attached"]),
  project: ProjectRefSchema.optional(),
  notes: z.array(z.object({
    id: z.string(),
    title: z.string(),
    project: ProjectRefSchema.optional(),
    tags: z.array(z.string()),
    lifecycle: _NoteLifecycle,
    role: _NoteRole.optional(),
    vault: _VaultLabel,
    updatedAt: z.string(),
    hasRelated: z.boolean().optional(),
  })),
  options: z.object({
    includeRelations: z.boolean().optional(),
    includePreview: z.boolean().optional(),
    includeStorage: z.boolean().optional(),
    includeUpdated: z.boolean().optional(),
  }).optional(),
});

export const UpdateResultSchema = z.object({
  action: z.literal("updated"),
  id: z.string(),
  title: z.string(),
  fieldsModified: z.array(z.string()),
  timestamp: z.string(),
  project: ProjectRefSchema.optional(),
  lifecycle: _NoteLifecycle,
  role: _NoteRole.optional(),
  lintWarnings: z.array(z.string()).optional(),
  persistence: PersistenceStatusSchema,
});

export const UpdateToolResultSchema = z.object({
  action: z.enum(["updated", "lint_error"]).describe("Result variant: 'updated' for success, 'lint_error' when unfixable markdown lint errors prevented the update."),
  tool: z.literal("update").optional().describe("Present and set to 'update' when action is lint_error."),
  id: z.string().optional().describe("Note id, present when action is updated."),
  title: z.string().optional().describe("Note title, present when action is updated."),
  fieldsModified: z.array(z.string()).optional().describe("List of fields that changed, present when action is updated."),
  timestamp: z.string().optional().describe("ISO timestamp, present when action is updated."),
  project: ProjectRefSchema.optional().describe("Project reference, present when action is updated."),
  lifecycle: _NoteLifecycle.optional().describe("Note lifecycle, present when action is updated."),
  role: _NoteRole.optional().describe("Note role, present when action is updated."),
  lintWarnings: z.array(z.string()).optional().describe("Auto-fixed lint warnings from semantic patch, present when action is updated."),
  persistence: PersistenceStatusSchema.optional().describe("Git and embedding persistence status, present when action is updated."),
  issues: z.array(z.string()).optional().describe("Unfixable markdown lint issues that prevented the update. Present when action is lint_error."),
}).superRefine((value, ctx) => {
  if (value.action === "updated") {
    if (!value.id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["id"], message: "id is required when action=updated" });
    if (!value.title) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["title"], message: "title is required when action=updated" });
    if (!value.fieldsModified) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fieldsModified"], message: "fieldsModified is required when action=updated" });
    if (!value.timestamp) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["timestamp"], message: "timestamp is required when action=updated" });
    if (!value.lifecycle) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lifecycle"], message: "lifecycle is required when action=updated" });
    if (!value.persistence) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["persistence"], message: "persistence is required when action=updated" });
  }
  if (value.action === "lint_error") {
    if (value.tool !== "update") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tool"], message: "tool must be update when action=lint_error" });
    if (!value.issues) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["issues"], message: "issues is required when action=lint_error" });
  }
});

export const ForgetResultSchema = z.object({
  action: z.literal("forgotten"),
  id: z.string(),
  title: z.string(),
  project: ProjectRefSchema.optional(),
  relationshipsCleaned: z.number(),
  vaultsModified: z.array(z.string()),
  retry: PersistenceStatusSchema.shape.retry,
});

export const MoveResultSchema = z.object({
  action: z.literal("moved"),
  id: z.string(),
  fromVault: _VaultLabel,
  toVault: _VaultLabel,
  projectAssociation: z.string(),
  title: z.string(),
  metadataRewritten: z.boolean().optional(),
  persistence: PersistenceStatusSchema,
});

export const RelateResultSchema = z.object({
  action: z.enum(["related", "unrelated"]),
  fromId: z.string(),
  toId: z.string(),
  type: _RelationshipType,
  bidirectional: z.boolean(),
  notesModified: z.array(z.string()),
  retry: PersistenceStatusSchema.shape.retry,
});

export const RecentResultSchema = z.object({
  action: z.literal("recent_shown"),
  project: ProjectRefSchema.optional(),
  count: z.number(),
  limit: z.number(),
  notes: z.array(z.object({
    id: z.string(),
    title: z.string(),
    project: ProjectRefSchema.optional(),
    tags: z.array(z.string()),
    lifecycle: _NoteLifecycle,
    vault: _VaultLabel,
    updatedAt: z.string(),
    preview: z.string().optional(),
  })),
});

export const MemoryGraphResultSchema = z.object({
  action: z.literal("graph_shown"),
  project: ProjectRefSchema.optional(),
  nodes: z.array(z.object({
    id: z.string(),
    title: z.string(),
    edges: z.array(z.object({ toId: z.string(), type: _RelationshipType })),
  })),
  limit: z.number(),
  truncated: z.boolean(),
});

export const ThemeSectionSchema = z.object({
  count: z.number(),
  examples: z.array(z.object({
    id: z.string(),
    title: z.string(),
    updatedAt: z.string(),
  })),
});

export const AnchorNoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  centrality: z.number(),
  connectionDiversity: z.number(),
  updatedAt: z.string(),
});

export const RecentNoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.string(),
  theme: z.string(),
});

export const RelatedGlobalNoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  similarity: z.number(),
  preview: z.string(),
});

export const ProjectSummaryNotesSchema = z.object({
  total: z.number(),
  projectVault: z.number(),
  mainVault: z.number(),
  privateProject: z.number(),
});

export const OrientationNoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  rationale: z.string(),
  provenance: z.object({
    lastUpdatedAt: z.string(),
    lastCommitHash: z.string(),
    lastCommitMessage: z.string(),
    recentlyChanged: z.boolean(),
  }).optional(),
  confidence: _Confidence.optional(),
  relationships: RelationshipPreviewSchema.optional(),
});

export const OrientationSchema = z.object({
  primaryEntry: OrientationNoteSchema,
  suggestedNext: z.array(OrientationNoteSchema),
  warnings: z.array(z.string()).optional(),
});

export const WorkingStateNoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.string(),
  rationale: z.string(),
  preview: z.string(),
  nextAction: z.string().optional(),
});

export const WorkingStateSchema = z.object({
  summary: z.string(),
  recoveryHint: z.string(),
  notes: z.array(WorkingStateNoteSchema),
});

export const ProjectMaintenanceWarningSchema = z.object({
  code: z.enum(PROJECT_MAINTENANCE_WARNING_CODES)
    .describe("Stable warning code for a project memory maintenance condition."),
  severity: z.enum(PROJECT_MAINTENANCE_WARNING_SEVERITIES)
    .describe("Advisory severity for the maintenance condition; warnings still require explicit user action."),
  message: z.string()
    .describe("Compact human-readable maintenance warning matching the text output."),
  count: z.number().optional()
    .describe("Number of notes or conditions represented by this warning when applicable."),
  sampleNotes: z.array(z.object({
    id: z.string().describe("Memory id for a bounded sample note that triggered this warning."),
    title: z.string().describe("Title for a bounded sample note that triggered this warning."),
  })).optional()
    .describe("Bounded sample of notes that triggered this warning."),
  suggestedAction: z.string()
    .describe("Explicit next action the agent can take; never an automatic cleanup action."),
});

export const ProjectSummaryResultSchema = z.object({
  action: z.literal("project_summary_shown"),
  project: ProjectRefSchema,
  notes: ProjectSummaryNotesSchema,
  themes: z.record(z.string(), ThemeSectionSchema),
  recent: z.array(RecentNoteSchema),
  anchors: z.array(AnchorNoteSchema),
  orientation: OrientationSchema,
  maintenanceWarnings: z.array(ProjectMaintenanceWarningSchema).optional()
    .describe("Advisory project memory health warnings derived from loaded metadata only."),
  workingState: WorkingStateSchema.optional(),
  relatedGlobal: z.object({
    notes: z.array(RelatedGlobalNoteSchema),
    computedAt: z.string(),
  }).optional(),
});

export const SyncResultSchema = z.object({
  action: z.literal("synced"),
  vaults: z.array(z.object({
    vault: z.enum(["main", "project", "attached"]),
    hasRemote: z.boolean(),
    pulled: z.number(),
    deleted: z.number(),
    pushed: z.number(),
    embedded: z.number(),
    failed: z.array(z.object({
      id: z.string().describe("Note id that failed to embed"),
      error: z.string().describe("Error message from the embedding provider"),
    })),
    gitError: z.object({
      phase: z.enum(["fetch", "pull", "push"]),
      message: z.string(),
      isConflict: z.boolean(),
      conflictFiles: z.array(z.string()).optional(),
    }).optional(),
    attachedSlug: z.string().optional().describe("For attached vaults: the project slug identifying the attachment."),
  })),
});

export const ReindexResultSchema = z.object({
  action: z.literal("reindexed"),
  vaults: z.array(z.object({
    vault: z.enum(["main", "project"]),
    rebuilt: z.number(),
    failed: z.array(z.object({
      id: z.string().describe("Note id that failed to embed"),
      error: z.string().describe("Error message from the embedding provider"),
    })),
  })),
});

export const GetResultSchema = z.object({
  action: z.literal("got"),
  count: z.number(),
  notes: z.array(z.object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    project: ProjectRefSchema.optional(),
    tags: z.array(z.string()),
    lifecycle: _NoteLifecycle,
    role: _NoteRole.optional(),
    alwaysLoad: z.boolean().optional(),
    relatedTo: z.array(z.object({ id: z.string(), type: _RelationshipType })).optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    vault: _VaultLabel,
    relationships: RelationshipPreviewSchema.optional(),
  })),
  notFound: z.array(z.string()),
});

export const WhereIsResultSchema = z.object({
  action: z.literal("located"),
  id: z.string(),
  title: z.string(),
  project: ProjectRefSchema.optional(),
  vault: _VaultLabel,
  updatedAt: z.string(),
  relatedCount: z.number(),
});

export const ConsolidateClassificationSchema = z.enum(CONSOLIDATE_CLASSIFICATIONS)
  .describe("Advisory classification for consolidation evidence: lineage (expected workflow overlap), duplicate-pressure (same role/lifecycle, no lineage), unique-evidence-risk (research with unique source), supersession-pressure (superseded and stale).");

const ConsolidateNoteMergeEvidenceBaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  lifecycle: _NoteLifecycle,
  role: _NoteRole.optional(),
  ageDays: z.number(),
  superseded: z.boolean(),
  supersededBy: z.string().optional(),
  supersededCount: z.number().int().optional(),
  relatedCount: z.number(),
  classification: ConsolidateClassificationSchema.optional()
    .describe("Advisory classification for this note in the consolidation context."),
  warnings: z.array(z.string()).optional(),
  mergeRisk: _MergeRisk,
});

export const ConsolidateMaintenanceWarningSchema = z.object({
  code: z.enum(CONSOLIDATE_MAINTENANCE_WARNING_CODES)
    .describe("Stable warning code for a consolidation maintenance condition."),
  severity: z.enum(PROJECT_MAINTENANCE_WARNING_SEVERITIES)
    .describe("Advisory severity for the maintenance condition."),
  message: z.string()
    .describe("Compact human-readable maintenance warning."),
  count: z.number().optional()
    .describe("Number of notes or conditions represented by this warning."),
  sampleNotes: z.array(z.object({
    id: z.string().describe("Memory id for a bounded sample note."),
    title: z.string().describe("Title for a bounded sample note."),
  })).optional()
    .describe("Bounded sample of notes that triggered this warning."),
  suggestedAction: z.string()
    .describe("Explicit next action for the agent; never an automatic cleanup action."),
});

export const ConsolidateResultSchema = z.object({
  action: z.literal("consolidated"),
  strategy: z.string(),
  project: ProjectRefSchema.optional(),
  notesProcessed: z.number(),
  notesModified: z.number(),
  warnings: z.array(z.string()).optional(),
  maintenanceWarnings: z.array(ConsolidateMaintenanceWarningSchema).optional()
    .describe("Advisory maintenance warnings derived from consolidate analysis."),
  themeGroups: z.array(z.object({
    name: z.string(),
    count: z.number(),
    examples: z.array(z.string()),
  })).optional(),
  relationshipClusters: z.array(z.object({
    hub: z.object({
      id: z.string(),
      title: z.string(),
    }),
    notes: z.array(z.object({
      id: z.string(),
      title: z.string(),
    })),
  })).optional(),
  duplicatePairs: z.array(z.object({
    similarity: z.number(),
    noteA: ConsolidateNoteMergeEvidenceBaseSchema,
    noteB: ConsolidateNoteMergeEvidenceBaseSchema,
    warnings: z.array(z.string()).optional(),
    mergeRisk: _MergeRisk,
  })).optional(),
  mergeSuggestions: z.array(z.object({
    targetTitle: z.string(),
    sourceIds: z.array(z.string()),
    mode: z.enum(["supersedes", "delete"]),
    notes: z.array(ConsolidateNoteMergeEvidenceBaseSchema),
    warnings: z.array(z.string()).optional(),
    mergeRisk: _MergeRisk,
  })).optional(),
  executeMergeEvidence: z.object({
    notes: z.array(ConsolidateNoteMergeEvidenceBaseSchema),
    warnings: z.array(z.string()).optional(),
    mergeRisk: _MergeRisk,
  }).optional(),
  persistence: PersistenceStatusSchema.optional(),
  retry: PersistenceStatusSchema.shape.retry,
});

export const ProjectIdentityResultSchema = z.object({
  action: z.enum(["project_identity_set", "project_identity_shown", "project_identity_detected"]),
  project: z.object({
    id: z.string(),
    name: z.string(),
    source: z.string(),
    remoteName: RemoteNameSchema.optional(),
  }).optional(),
  identityOverride: z.object({
    remoteName: RemoteNameSchema,
    updatedAt: z.string(),
  }).optional(),
  defaultProject: z.object({
    id: z.string(),
    name: z.string(),
    remoteName: RemoteNameSchema.optional(),
  }).optional(),
  retry: PersistenceStatusSchema.shape.retry,
});

export const MigrationListResultSchema = z.object({
  action: z.literal("migration_list"),
  vaults: z.array(z.object({
    path: z.string(),
    type: z.enum(["main", "project"]),
    version: z.string(),
    pending: z.number(),
  })),
  available: z.array(z.object({ name: z.string(), description: z.string() })),
  totalPending: z.number(),
});

export const MigrationExecuteResultSchema = z.object({
  action: z.literal("migration_executed"),
  migration: z.string(),
  dryRun: z.boolean(),
  vaultsProcessed: z.number(),
  vaultResults: z.array(z.object({
    path: z.string(),
    notesProcessed: z.number(),
    notesModified: z.number(),
    errors: z.array(z.object({ noteId: z.string(), error: z.string() })),
    warnings: z.array(z.string()),
  })),
});

export const PolicyResultSchema = z.object({
  action: z.enum(["policy_set", "policy_shown"]),
  project: z.object({ id: z.string(), name: z.string() }),
  defaultScope: z.string().optional(),
  consolidationMode: z.string().optional(),
  protectedBranchPatterns: z.array(z.string()).optional(),
  protectedBranchBehavior: z.string().optional(),
  maxAttachmentsPerProject: z.number().optional(),
  updatedAt: z.string().optional(),
  retry: PersistenceStatusSchema.shape.retry,
});

export const AddAttachmentResultSchema = z.object({
  action: z.literal("attachment_added"),
  project: z.object({ id: z.string(), name: z.string() }),
  attachment: z.object({
    projectSlug: z.string(),
    projectName: z.string(),
    localPath: z.string(),
    vaultFolder: z.string(),
    enabled: z.boolean(),
    branch: z.string(),
    branchTipHash: z.string(),
  }),
  warnings: z.array(z.string()).optional(),
  retry: PersistenceStatusSchema.shape.retry,
});

export const RemoveAttachmentResultSchema = z.object({
  action: z.literal("attachment_removed"),
  project: z.object({ id: z.string(), name: z.string() }),
  removedAttachment: z.object({
    projectSlug: z.string(),
    projectName: z.string(),
    localPath: z.string(),
    vaultFolder: z.string(),
    branch: z.string(),
  }),
  retry: PersistenceStatusSchema.shape.retry,
});

export const ListAttachmentsResultSchema = z.object({
  action: z.literal("attachments_listed"),
  project: z.object({ id: z.string(), name: z.string() }),
  attachments: z.array(z.object({
    projectSlug: z.string(),
    projectName: z.string(),
    localPath: z.string(),
    vaultFolder: z.string(),
    enabled: z.boolean(),
    branch: z.string(),
    branchTipHash: z.string(),
    pathExists: z.boolean(),
    noteCount: z.number(),
  })),
  maxAttachmentsPerProject: z.number(),
});

export const SetAttachmentEnabledResultSchema = z.object({
  action: z.literal("attachment_enabled_set"),
  project: z.object({ id: z.string(), name: z.string() }),
  attachment: z.object({
    projectSlug: z.string(),
    projectName: z.string(),
    enabled: z.boolean(),
    branch: z.string(),
  }),
  retry: PersistenceStatusSchema.shape.retry,
});

export const SetAttachmentBranchResultSchema = z.object({
  action: z.literal("attachment_branch_set"),
  project: z.object({ id: z.string(), name: z.string() }),
  attachment: z.object({
    projectSlug: z.string(),
    projectName: z.string(),
    localPath: z.string(),
    vaultFolder: z.string(),
    enabled: z.boolean(),
    branch: z.string(),
    branchTipHash: z.string(),
  }),
  warnings: z.array(z.string()).optional(),
  retry: PersistenceStatusSchema.shape.retry,
});

export interface RelatedNotePreview {
  id: string;
  title: string;
  projectId?: string;
  theme?: string;
  relationType?: RelationshipType;
  updatedAt: string;
  confidence?: Confidence;
}

export interface RelationshipPreview {
  totalDirectRelations: number;
  shown: RelatedNotePreview[];
  truncated: boolean;
}

export interface DiscoverTagsResult extends Record<string, unknown> {
  action: "tags_discovered";
  project?: { id: string; name: string };
  mode: "suggest" | "browse";
  scope: "project" | "global" | "all";
  recommendedTags?: Array<{
    tag: string;
    usageCount: number;
    example?: string;
    reason?: string;
    lifecycleTypes: NoteLifecycle[];
    isTemporaryOnly: boolean;
  }>;
  tags?: Array<{
    tag: string;
    usageCount: number;
    examples: string[];
    lifecycleTypes: NoteLifecycle[];
    isTemporaryOnly: boolean;
  }>;
  totalTags: number;
  totalNotes: number;
  vaultsSearched: number;
  durationMs: number;
}

export const DiscoverTagsResultSchema = z.object({
  action: z.literal("tags_discovered"),
  project: z.object({ id: z.string(), name: z.string() }).optional(),
  mode: z.enum(["suggest", "browse"]),
  scope: z.enum(["project", "global", "all"]),
  recommendedTags: z.array(z.object({
    tag: z.string(),
    usageCount: z.number(),
    example: z.string().optional(),
    reason: z.string().optional(),
    lifecycleTypes: z.array(_NoteLifecycle),
    isTemporaryOnly: z.boolean(),
  })).optional(),
  tags: z.array(z.object({
    tag: z.string(),
    usageCount: z.number(),
    examples: z.array(z.string()),
    lifecycleTypes: z.array(_NoteLifecycle),
    isTemporaryOnly: z.boolean(),
  })).optional(),
  totalTags: z.number(),
  totalNotes: z.number(),
  vaultsSearched: z.number(),
  durationMs: z.number(),
});
