import { z } from "zod";
import type { Vault } from "./vault.js";
import type { Note, NoteLifecycle, RelationshipType } from "./storage.js";

export interface PersistenceStatus {
  notePath: string;
  embeddingPath: string;
  embedding: {
    status: "written" | "skipped";
    model: string;
    reason?: string;
  };
  git: {
    commit: "committed" | "skipped";
    push: "pushed" | "skipped";
    commitMessage?: string;
    commitBody?: string;
    commitReason?: string;
    pushReason?: string;
  };
  durability: "local-only" | "committed" | "pushed";
}

export interface StructuredResponse {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}

export interface RememberResult extends Record<string, unknown> {
  action: "remembered";
  id: string;
  title: string;
  project?: { id: string; name: string };
  scope: "project" | "global";
  vault: "project-vault" | "main-vault";
  tags: string[];
  lifecycle: NoteLifecycle;
  timestamp: string;
  persistence: PersistenceStatus;
}

export interface RecallResult extends Record<string, unknown> {
  action: "recalled";
  query: string;
  scope: "project" | "global" | "all";
  results: Array<{
    id: string;
    title: string;
    score: number;
    boosted: number;
    project?: string;
    projectName?: string;
    vault: "project-vault" | "main-vault";
    tags: string[];
    lifecycle: NoteLifecycle;
    updatedAt: string;
  }>;
}

export interface ListResult extends Record<string, unknown> {
  action: "listed";
  count: number;
  scope: "project" | "global" | "all";
  storedIn: "project-vault" | "main-vault" | "any";
  project?: { id: string; name: string };
  notes: Array<{
    id: string;
    title: string;
    project?: string;
    projectName?: string;
    tags: string[];
    lifecycle: NoteLifecycle;
    vault: "project-vault" | "main-vault";
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
    project?: string;
    projectName?: string;
    tags: string[];
    lifecycle: NoteLifecycle;
    relatedTo?: Array<{ id: string; type: RelationshipType }>;
    createdAt: string;
    updatedAt: string;
    vault: "project-vault" | "main-vault";
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
}

export interface MoveResult extends Record<string, unknown> {
  action: "moved";
  id: string;
  fromVault: "project-vault" | "main-vault";
  toVault: "project-vault" | "main-vault";
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
  project?: string;
  projectName?: string;
  lifecycle: NoteLifecycle;
  persistence: PersistenceStatus;
}

export interface ForgetResult extends Record<string, unknown> {
  action: "forgotten";
  id: string;
  title: string;
  project?: string;
  projectName?: string;
  relationshipsCleaned: number;
  vaultsModified: string[];
}

export interface SyncResult extends Record<string, unknown> {
  action: "synced";
  vaults: Array<{
    vault: "main" | "project";
    hasRemote: boolean;
    pulled: number;
    deleted: number;
    pushed: number;
    embedded: number;
    failed: string[];
  }>;
}

export interface ReindexResult extends Record<string, unknown> {
  action: "reindexed";
  vaults: Array<{
    vault: "main" | "project";
    rebuilt: number;
    failed: string[];
  }>;
}

export interface ConsolidateResult extends Record<string, unknown> {
  action: "consolidated";
  strategy: string;
  project?: string;
  projectName?: string;
  notesProcessed: number;
  notesModified: number;
  warnings?: string[];
  persistence?: PersistenceStatus;
}

export interface ProjectIdentityResult extends Record<string, unknown> {
  action: "project_identity_set" | "project_identity_shown" | "project_identity_detected";
  project?: { id: string; name: string; source: string; remoteName?: string };
  identityOverride?: { remoteName: string; updatedAt: string };
  defaultProject?: { id: string; name: string; remoteName?: string };
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
  updatedAt?: string;
}

export interface WhereIsResult extends Record<string, unknown> {
  action: "located";
  id: string;
  title: string;
  project?: string;
  projectName?: string;
  vault: "project-vault" | "main-vault";
  updatedAt: string;
  relatedCount: number;
}

export interface MemoryGraphResult extends Record<string, unknown> {
  action: "graph_shown";
  project?: string;
  projectName?: string;
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
  project?: string;
  projectName?: string;
  count: number;
  limit: number;
  notes: Array<{
    id: string;
    title: string;
    project?: string;
    projectName?: string;
    tags: string[];
    lifecycle: NoteLifecycle;
    vault: "project-vault" | "main-vault";
    updatedAt: string;
    preview?: string;
  }>;
}

export interface ProjectSummaryResult extends Record<string, unknown> {
  action: "project_summary_shown";
  project: { id: string; name: string };
  notes: {
    total: number;
    projectVault: number;
    mainVault: number;
    privateProject: number;
  };
  themes: Record<string, number>;
  recent: Array<{
    id: string;
    title: string;
    updatedAt: string;
  }>;
}

// ── Zod output schemas ────────────────────────────────────────────────────────

const _NoteLifecycle = z.enum(["temporary", "permanent"]);
const _RelationshipType = z.enum(["related-to", "explains", "example-of", "supersedes"]);
const _VaultLabel = z.enum(["project-vault", "main-vault"]);

export const PersistenceStatusSchema = z.object({
  notePath: z.string(),
  embeddingPath: z.string(),
  embedding: z.object({
    status: z.enum(["written", "skipped"]),
    model: z.string(),
    reason: z.string().optional(),
  }),
  git: z.object({
    commit: z.enum(["committed", "skipped"]),
    push: z.enum(["pushed", "skipped"]),
    commitMessage: z.string().optional(),
    commitBody: z.string().optional(),
    commitReason: z.string().optional(),
    pushReason: z.string().optional(),
  }),
  durability: z.enum(["local-only", "committed", "pushed"]),
});

export const RememberResultSchema = z.object({
  action: z.literal("remembered"),
  id: z.string(),
  title: z.string(),
  project: z.object({ id: z.string(), name: z.string() }).optional(),
  scope: z.enum(["project", "global"]),
  vault: _VaultLabel,
  tags: z.array(z.string()),
  lifecycle: _NoteLifecycle,
  timestamp: z.string(),
  persistence: PersistenceStatusSchema,
});

export const RecallResultSchema = z.object({
  action: z.literal("recalled"),
  query: z.string(),
  scope: z.enum(["project", "global", "all"]),
  results: z.array(z.object({
    id: z.string(),
    title: z.string(),
    score: z.number(),
    boosted: z.number(),
    project: z.string().optional(),
    projectName: z.string().optional(),
    vault: _VaultLabel,
    tags: z.array(z.string()),
    lifecycle: _NoteLifecycle,
    updatedAt: z.string(),
  })),
});

export const ListResultSchema = z.object({
  action: z.literal("listed"),
  count: z.number(),
  scope: z.enum(["project", "global", "all"]),
  storedIn: z.enum(["project-vault", "main-vault", "any"]),
  project: z.object({ id: z.string(), name: z.string() }).optional(),
  notes: z.array(z.object({
    id: z.string(),
    title: z.string(),
    project: z.string().optional(),
    projectName: z.string().optional(),
    tags: z.array(z.string()),
    lifecycle: _NoteLifecycle,
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
  project: z.string().optional(),
  projectName: z.string().optional(),
  lifecycle: _NoteLifecycle,
  persistence: PersistenceStatusSchema,
});

export const ForgetResultSchema = z.object({
  action: z.literal("forgotten"),
  id: z.string(),
  title: z.string(),
  project: z.string().optional(),
  projectName: z.string().optional(),
  relationshipsCleaned: z.number(),
  vaultsModified: z.array(z.string()),
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
});

export const RecentResultSchema = z.object({
  action: z.literal("recent_shown"),
  project: z.string().optional(),
  projectName: z.string().optional(),
  count: z.number(),
  limit: z.number(),
  notes: z.array(z.object({
    id: z.string(),
    title: z.string(),
    project: z.string().optional(),
    projectName: z.string().optional(),
    tags: z.array(z.string()),
    lifecycle: _NoteLifecycle,
    vault: _VaultLabel,
    updatedAt: z.string(),
    preview: z.string().optional(),
  })),
});

export const MemoryGraphResultSchema = z.object({
  action: z.literal("graph_shown"),
  project: z.string().optional(),
  projectName: z.string().optional(),
  nodes: z.array(z.object({
    id: z.string(),
    title: z.string(),
    edges: z.array(z.object({ toId: z.string(), type: _RelationshipType })),
  })),
  limit: z.number(),
  truncated: z.boolean(),
});

export const ProjectSummaryResultSchema = z.object({
  action: z.literal("project_summary_shown"),
  project: z.object({ id: z.string(), name: z.string() }),
  notes: z.object({
    total: z.number(),
    projectVault: z.number(),
    mainVault: z.number(),
    privateProject: z.number(),
  }),
  themes: z.record(z.number()),
  recent: z.array(z.object({
    id: z.string(),
    title: z.string(),
    updatedAt: z.string(),
  })),
});

export const SyncResultSchema = z.object({
  action: z.literal("synced"),
  vaults: z.array(z.object({
    vault: z.enum(["main", "project"]),
    hasRemote: z.boolean(),
    pulled: z.number(),
    deleted: z.number(),
    pushed: z.number(),
    embedded: z.number(),
    failed: z.array(z.string()),
  })),
});

export const ReindexResultSchema = z.object({
  action: z.literal("reindexed"),
  vaults: z.array(z.object({
    vault: z.enum(["main", "project"]),
    rebuilt: z.number(),
    failed: z.array(z.string()),
  })),
});

export const GetResultSchema = z.object({
  action: z.literal("got"),
  count: z.number(),
  notes: z.array(z.object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    project: z.string().optional(),
    projectName: z.string().optional(),
    tags: z.array(z.string()),
    lifecycle: _NoteLifecycle,
    relatedTo: z.array(z.object({ id: z.string(), type: _RelationshipType })).optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    vault: _VaultLabel,
  })),
  notFound: z.array(z.string()),
});

export const WhereIsResultSchema = z.object({
  action: z.literal("located"),
  id: z.string(),
  title: z.string(),
  project: z.string().optional(),
  projectName: z.string().optional(),
  vault: _VaultLabel,
  updatedAt: z.string(),
  relatedCount: z.number(),
});

export const ConsolidateResultSchema = z.object({
  action: z.literal("consolidated"),
  strategy: z.string(),
  project: z.string().optional(),
  projectName: z.string().optional(),
  notesProcessed: z.number(),
  notesModified: z.number(),
  warnings: z.array(z.string()).optional(),
  persistence: PersistenceStatusSchema.optional(),
});

export const ProjectIdentityResultSchema = z.object({
  action: z.enum(["project_identity_set", "project_identity_shown", "project_identity_detected"]),
  project: z.object({
    id: z.string(),
    name: z.string(),
    source: z.string(),
    remoteName: z.string().optional(),
  }).optional(),
  identityOverride: z.object({
    remoteName: z.string(),
    updatedAt: z.string(),
  }).optional(),
  defaultProject: z.object({
    id: z.string(),
    name: z.string(),
    remoteName: z.string().optional(),
  }).optional(),
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
  updatedAt: z.string().optional(),
});
