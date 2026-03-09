import type { Vault } from "./vault.js";
import type { Note, NoteLifecycle, RelationshipType } from "./storage.js";

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
