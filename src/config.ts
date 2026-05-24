import fs from "fs/promises";
import path from "path";
import { z } from "zod";

import { attempt, attemptSync, debugLog, getErrorMessage } from "./error-utils.js";
import {
  CONSOLIDATION_MODES,
  PROJECT_POLICY_SCOPES,
  PROTECTED_BRANCH_BEHAVIORS,
  type ProjectMemoryPolicy,
} from "./project-memory-policy.js";
import type { ProjectIdentityOverride } from "./project.js";
import type { ProjectAttachmentConfig } from "./vault.js";

export type MutationPushMode = "all" | "main-only" | "none";

export interface MnemonicConfig {
  schemaVersion: string;
  reindexEmbedConcurrency: number;
  mutationPushMode: MutationPushMode;
  projectMemoryPolicies: Record<string, ProjectMemoryPolicy>;
  projectIdentityOverrides: Record<string, ProjectIdentityOverride>;
  projectAttachments: Record<string, ProjectAttachmentConfig[]>;
  maxAttachmentsPerProject: number;
}

const defaultConfig: MnemonicConfig = {
  // Keep this at the latest schema version. When adding a new latest-schema
  // migration, bump this value in the same change so fresh installs start at
  // the current schema instead of missing that migration.
  schemaVersion: "1.3",
  reindexEmbedConcurrency: 4,
  mutationPushMode: "main-only",
  projectMemoryPolicies: {},
  projectIdentityOverrides: {},
  projectAttachments: {},
  maxAttachmentsPerProject: 5,
};

function normalizeSchemaVersion(value: unknown): string {
  if (typeof value !== "string") {
    return defaultConfig.schemaVersion;
  }

  const trimmed = value.trim();
  return /^\d+(\.\d+)*$/.test(trimmed) ? trimmed : defaultConfig.schemaVersion;
}

function normalizeConcurrency(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultConfig.reindexEmbedConcurrency;
  }

  return Math.min(16, Math.max(1, Math.floor(value)));
}

function normalizeMutationPushMode(value: unknown): MutationPushMode {
  switch (value) {
    case "all":
    case "main-only":
    case "none":
      return value;
    default:
      return defaultConfig.mutationPushMode;
  }
}

function normalizeProjectIdentityOverrides(value: unknown): Record<string, ProjectIdentityOverride> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const normalized: Record<string, ProjectIdentityOverride> = {};
  for (const [projectId, override] of Object.entries(value)) {
    if (!override || typeof override !== "object") {
      continue;
    }

    const remoteName = (override as { remoteName?: unknown }).remoteName;
    if (typeof remoteName !== "string" || remoteName.trim().length === 0) {
      continue;
    }

    const updatedAt = (override as { updatedAt?: unknown }).updatedAt;
    normalized[projectId] = {
      remoteName: remoteName.trim(),
      updatedAt: typeof updatedAt === "string" ? updatedAt : "",
    };
  }

  return normalized;
}

function normalizeProjectMemoryPolicies(value: unknown): Record<string, ProjectMemoryPolicy> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const normalized: Record<string, ProjectMemoryPolicy> = {};
  for (const [projectId, policy] of Object.entries(value)) {
    if (!policy || typeof policy !== "object") {
      continue;
    }

    const policyRecord = policy as {
      projectId?: unknown;
      projectName?: unknown;
      defaultScope?: unknown;
      consolidationMode?: unknown;
      protectedBranchPatterns?: unknown;
      protectedBranchBehavior?: unknown;
      updatedAt?: unknown;
    };

    const normalizedProjectId =
      typeof policyRecord.projectId === "string" && policyRecord.projectId.trim().length > 0
        ? policyRecord.projectId.trim()
        : projectId;

    const defaultScope = PROJECT_POLICY_SCOPES.includes(policyRecord.defaultScope as (typeof PROJECT_POLICY_SCOPES)[number])
      ? (policyRecord.defaultScope as (typeof PROJECT_POLICY_SCOPES)[number])
      : "project";

    const consolidationMode = CONSOLIDATION_MODES.includes(
      policyRecord.consolidationMode as (typeof CONSOLIDATION_MODES)[number]
    )
      ? (policyRecord.consolidationMode as (typeof CONSOLIDATION_MODES)[number])
      : undefined;

    const protectedBranchBehavior = PROTECTED_BRANCH_BEHAVIORS.includes(
      policyRecord.protectedBranchBehavior as (typeof PROTECTED_BRANCH_BEHAVIORS)[number]
    )
      ? (policyRecord.protectedBranchBehavior as (typeof PROTECTED_BRANCH_BEHAVIORS)[number])
      : undefined;

    const protectedBranchPatterns = Array.isArray(policyRecord.protectedBranchPatterns)
      ? policyRecord.protectedBranchPatterns
        .filter((pattern): pattern is string => typeof pattern === "string")
        .map((pattern) => pattern.trim())
        .filter((pattern) => pattern.length > 0)
      : undefined;

    normalized[projectId] = {
      projectId: normalizedProjectId,
      projectName: typeof policyRecord.projectName === "string" ? policyRecord.projectName : undefined,
      defaultScope,
      consolidationMode,
      protectedBranchPatterns,
      protectedBranchBehavior,
      updatedAt: typeof policyRecord.updatedAt === "string" ? policyRecord.updatedAt : "",
    };
  }

  return normalized;
}

function normalizeProjectAttachments(value: unknown): Record<string, ProjectAttachmentConfig[]> {
  if (!value || typeof value !== "object") return {};

  const normalized: Record<string, ProjectAttachmentConfig[]> = {};
  for (const [projectId, attachments] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(attachments)) continue;
    const validAttachments: ProjectAttachmentConfig[] = [];
    for (const att of attachments) {
      if (!att || typeof att !== "object") continue;
      const a = att as Record<string, unknown>;
      if (typeof a.projectSlug !== "string" || !a.projectSlug.trim()) continue;
      if (typeof a.localPath !== "string" || !a.localPath.trim()) continue;
      validAttachments.push({
        projectSlug: a.projectSlug.trim(),
        projectName: typeof a.projectName === "string" ? a.projectName.trim() : a.projectSlug.trim(),
        localPath: a.localPath.trim(),
        vaultFolder: typeof a.vaultFolder === "string" && a.vaultFolder.trim() ? a.vaultFolder.trim() : ".mnemonic",
        enabled: typeof a.enabled === "boolean" ? a.enabled : true,
        branch: typeof a.branch === "string" ? a.branch : "main",
        addedAt: typeof a.addedAt === "string" ? a.addedAt : "",
        updatedAt: typeof a.updatedAt === "string" ? a.updatedAt : "",
        branchTipHash: typeof a.branchTipHash === "string" ? a.branchTipHash : "",
        writable: typeof a.writable === "boolean" ? a.writable : false,
        pushBranch: typeof a.pushBranch === "string" ? a.pushBranch.trim() : undefined,
      });
    }
    if (validAttachments.length > 0) {
      normalized[projectId] = validAttachments;
    }
  }
  return normalized;
}

function normalizeMaxAttachments(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 5;
  return Math.min(20, Math.max(1, Math.floor(value)));
}

/**
 * Read the schema version from a vault's config.json.
 * Works for both main vault and project vaults.
 * Returns the default schema version if no config exists.
 */
export async function readVaultSchemaVersion(vaultPath: string): Promise<string> {
  const filePath = path.join(path.resolve(vaultPath), "config.json");
  const result = await attempt("config:read-schema", () => fs.readFile(filePath, "utf-8"));
  if (!result.ok) return defaultConfig.schemaVersion;
  const jsonResult = attemptSync("config:parse", () => JSON.parse(result.value));
  if (!jsonResult.ok) return defaultConfig.schemaVersion;
  const parsed = VaultSchemaVersionFragmentSchema.safeParse(jsonResult.value);
  return normalizeSchemaVersion(parsed.success ? parsed.data.schemaVersion : undefined);
}

/**
 * Write the schema version to a vault's config.json.
 * Preserves any existing fields in the file.
 */
export async function writeVaultSchemaVersion(vaultPath: string, schemaVersion: string): Promise<void> {
  const filePath = path.join(path.resolve(vaultPath), "config.json");
  let existing: Record<string, unknown> = {};
  const existingResult = await attempt("config:read-existing", () => fs.readFile(filePath, "utf-8"));
  if (existingResult.ok) {
    const jsonResult = attemptSync("config:parse", () => JSON.parse(existingResult.value));
    const parsed = jsonResult.ok ? ConfigJsonObjectSchema.safeParse(jsonResult.value) : { success: false as const, data: undefined };
    existing = parsed.success ? parsed.data : {};
  } else {
    debugLog("config:write-schema-version", `no existing config, starting fresh: ${getErrorMessage(existingResult.error)}`);
  }
  existing.schemaVersion = normalizeSchemaVersion(schemaVersion);
  await fs.writeFile(filePath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
}

export class MnemonicConfigStore {
  readonly filePath: string;
  #cache: MnemonicConfig | null = null;

  constructor(mainVaultPath: string) {
    this.filePath = path.join(path.resolve(mainVaultPath), "config.json");
  }

  async load(): Promise<MnemonicConfig> {
    return this.readAll();
  }

  async getProjectPolicy(projectId: string): Promise<ProjectMemoryPolicy | undefined> {
    const config = await this.readAll();
    return config.projectMemoryPolicies[projectId];
  }

  async getProjectIdentityOverride(projectId: string): Promise<ProjectIdentityOverride | undefined> {
    const config = await this.readAll();
    return config.projectIdentityOverrides[projectId];
  }

  async setProjectPolicy(policy: ProjectMemoryPolicy): Promise<void> {
    const config = await this.readAll();
    config.projectMemoryPolicies[policy.projectId] = policy;
    await this.writeAll(config);
  }

  async setProjectIdentityOverride(projectId: string, override: ProjectIdentityOverride): Promise<void> {
    const config = await this.readAll();
    config.projectIdentityOverrides[projectId] = override;
    await this.writeAll(config);
  }

  async setSchemaVersion(schemaVersion: string): Promise<void> {
    const config = await this.readAll();
    config.schemaVersion = normalizeSchemaVersion(schemaVersion);
    await this.writeAll(config);
  }

  async getProjectAttachments(projectId: string): Promise<ProjectAttachmentConfig[]> {
    const config = await this.readAll();
    return config.projectAttachments[projectId] ?? [];
  }

  async setProjectAttachments(projectId: string, attachments: ProjectAttachmentConfig[]): Promise<void> {
    const config = await this.readAll();
    config.projectAttachments[projectId] = attachments;
    await this.writeAll(config);
  }

  async getMaxAttachmentsPerProject(): Promise<number> {
    const config = await this.readAll();
    return config.maxAttachmentsPerProject;
  }

  async setMaxAttachmentsPerProject(max: number): Promise<void> {
    const config = await this.readAll();
    config.maxAttachmentsPerProject = normalizeMaxAttachments(max);
    await this.writeAll(config);
  }

  invalidateCache(): void {
    this.#cache = null;
  }

  private async readAll(): Promise<MnemonicConfig> {
    if (this.#cache) {
      return this.#cache;
    }

    let config: MnemonicConfig;
    const readResult = await attempt("config:read", () => fs.readFile(this.filePath, "utf-8"));
    if (readResult.ok) {
      const jsonResult = attemptSync("config:parse", () => JSON.parse(readResult.value));
      const parsed = jsonResult.ok ? MnemonicConfigRawSchema.safeParse(jsonResult.value) : { success: false as const, data: undefined };
      const data = parsed.success ? parsed.data : {};
      config = {
        schemaVersion: normalizeSchemaVersion(data.schemaVersion),
        reindexEmbedConcurrency: normalizeConcurrency(data.reindexEmbedConcurrency),
        mutationPushMode: normalizeMutationPushMode(data.mutationPushMode),
        projectMemoryPolicies: normalizeProjectMemoryPolicies(data.projectMemoryPolicies),
        projectIdentityOverrides: normalizeProjectIdentityOverrides(data.projectIdentityOverrides),
        projectAttachments: normalizeProjectAttachments(data.projectAttachments),
        maxAttachmentsPerProject: normalizeMaxAttachments(data.maxAttachmentsPerProject),
      };
    } else {
      debugLog("config:read", `failed, returning defaults: ${getErrorMessage(readResult.error)}`);
      config = { ...defaultConfig };
    }

    this.#cache = config;
    return config;
  }

  private async writeAll(config: MnemonicConfig): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(config, null, 2) + "\n", "utf-8");
    this.#cache = config;
  }
}

const VaultSchemaVersionFragmentSchema = z.object({
  schemaVersion: z.unknown().optional(),
});

const ConfigJsonObjectSchema = z.record(z.string(), z.unknown());

const MnemonicConfigRawSchema = z.object({
  schemaVersion: z.unknown().optional(),
  reindexEmbedConcurrency: z.unknown().optional(),
  mutationPushMode: z.unknown().optional(),
  projectMemoryPolicies: z.unknown().optional(),
  projectIdentityOverrides: z.unknown().optional(),
  projectAttachments: z.unknown().optional(),
  maxAttachmentsPerProject: z.unknown().optional(),
}).passthrough();
