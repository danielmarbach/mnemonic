import fs from "fs/promises";
import path from "path";
import { z } from "zod";

import { debugLog, getErrorMessage } from "./error-utils.js";
import {
  CONSOLIDATION_MODES,
  PROJECT_POLICY_SCOPES,
  PROTECTED_BRANCH_BEHAVIORS,
  type ProjectMemoryPolicy,
} from "./project-memory-policy.js";
import type { ProjectIdentityOverride } from "./project.js";

export type MutationPushMode = "all" | "main-only" | "none";

export interface MnemonicConfig {
  schemaVersion: string;
  reindexEmbedConcurrency: number;
  mutationPushMode: MutationPushMode;
  projectMemoryPolicies: Record<string, ProjectMemoryPolicy>;
  projectIdentityOverrides: Record<string, ProjectIdentityOverride>;
}

const defaultConfig: MnemonicConfig = {
  // Keep this at the latest schema version. When adding a new latest-schema
  // migration, bump this value in the same change so fresh installs start at
  // the current schema instead of missing that migration.
  schemaVersion: "1.1",
  reindexEmbedConcurrency: 4,
  mutationPushMode: "main-only",
  projectMemoryPolicies: {},
  projectIdentityOverrides: {},
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

/**
 * Read the schema version from a vault's config.json.
 * Works for both main vault and project vaults.
 * Returns the default schema version if no config exists.
 */
export async function readVaultSchemaVersion(vaultPath: string): Promise<string> {
  const filePath = path.join(path.resolve(vaultPath), "config.json");
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = VaultSchemaVersionFragmentSchema.safeParse(JSON.parse(raw));
    return normalizeSchemaVersion(parsed.success ? parsed.data.schemaVersion : undefined);
  } catch {
    return defaultConfig.schemaVersion;
  }
}

/**
 * Write the schema version to a vault's config.json.
 * Preserves any existing fields in the file.
 */
export async function writeVaultSchemaVersion(vaultPath: string, schemaVersion: string): Promise<void> {
  const filePath = path.join(path.resolve(vaultPath), "config.json");
  let existing: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = ConfigJsonObjectSchema.safeParse(JSON.parse(raw));
    existing = parsed.success ? parsed.data : {};
  } catch (err) {
    debugLog("config:write-schema-version", `no existing config, starting fresh: ${getErrorMessage(err)}`);
  }
  existing.schemaVersion = normalizeSchemaVersion(schemaVersion);
  await fs.writeFile(filePath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
}

export class MnemonicConfigStore {
  readonly filePath: string;

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

  private async readAll(): Promise<MnemonicConfig> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = MnemonicConfigRawSchema.safeParse(JSON.parse(raw));
      const data = parsed.success ? parsed.data : {};
      return {
        schemaVersion: normalizeSchemaVersion(data.schemaVersion),
        reindexEmbedConcurrency: normalizeConcurrency(data.reindexEmbedConcurrency),
        mutationPushMode: normalizeMutationPushMode(data.mutationPushMode),
        projectMemoryPolicies: normalizeProjectMemoryPolicies(data.projectMemoryPolicies),
        projectIdentityOverrides: normalizeProjectIdentityOverrides(data.projectIdentityOverrides),
      };
    } catch (err) {
      debugLog("config:read", `failed, returning defaults: ${getErrorMessage(err)}`);
      return { ...defaultConfig };
    }
  }

  private async writeAll(config: MnemonicConfig): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(config, null, 2) + "\n", "utf-8");
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
}).passthrough();
