import type { CommitResult, PushResult } from "../git.js";
import type { MutationPushMode } from "../config.js";
import type { PersistenceStatus, MutationRetryContract } from "../structured-content.js";
import type { Vault } from "../vault.js";
import type { ServerContext } from "../server-context.js";
import { embedModel } from "../embeddings.js";
import { memoryId } from "../brands.js";
import { storageLabel } from "./vault.js";

export function resolveDurability(commit: CommitResult, push: PushResult): PersistenceStatus["durability"] {
  if (push.status === "pushed") {
    return "pushed";
  }

  if (commit.status === "committed") {
    return "committed";
  }

  return "local-only";
}

export function buildPersistenceStatus(args: {
  storage: import("../storage.js").Storage;
  id: string;
  embedding: { status: "written" | "skipped"; reason?: string };
  commit: CommitResult;
  push: PushResult;
  commitMessage?: string;
  commitBody?: string;
  retry?: MutationRetryContract;
}): PersistenceStatus {
  return {
    notePath: args.storage.notePath(memoryId(args.id)),
    embeddingPath: args.storage.embeddingPath(memoryId(args.id)),
    embedding: {
      status: args.embedding.status,
      model: embedModel,
      reason: args.embedding.reason,
    },
    git: {
      commit: args.commit.status,
      push: args.push.status,
      commitOperation: args.commit.status === "failed" ? args.commit.operation : undefined,
      commitMessage: args.commitMessage,
      commitBody: args.commitBody,
      commitReason: args.commit.status === "failed" ? args.commit.reason : args.commit.status === "skipped" ? args.commit.reason : undefined,
      commitError: args.commit.status === "failed" ? args.commit.error : undefined,
      pushReason: args.push.status === "skipped" ? args.push.reason : undefined,
      pushError: args.push.status === "failed" ? args.push.error : undefined,
    },
    retry: args.retry,
    durability: resolveDurability(args.commit, args.push),
  };
}

export function buildMutationRetryContract(args: {
  commit: CommitResult;
  commitMessage: string;
  commitBody?: string;
  files: string[];
  cwd?: string;
  vault: Vault;
  mutationApplied: boolean;
  preferredRecovery?: "manual-exact-git-recovery" | "rerun-tool-call-serial" | "no-manual-recovery";
}): MutationRetryContract | undefined {
  if (args.commit.status !== "failed") {
    return undefined;
  }

  const recoveryKind = args.preferredRecovery ?? (args.mutationApplied
    ? "manual-exact-git-recovery"
    : "no-manual-recovery");

  const recoveryReason = recoveryKind === "rerun-tool-call-serial"
    ? "Tool-level reconciliation exists for this mutation; rerun the same tool call serially for the affected vault."
    : recoveryKind === "manual-exact-git-recovery"
      ? "Mutation is already persisted on disk; manual git recovery is allowed only with the exact attemptedCommit values."
      : "Mutation was not applied deterministically; manual git recovery is not authorized.";

  return {
    recovery: {
      kind: recoveryKind,
      allowed: recoveryKind !== "no-manual-recovery",
      reason: recoveryReason,
    },
    attemptedCommit: {
      subject: args.commitMessage,
      body: args.commitBody,
      files: args.files,
      cwd: args.cwd,
      vault: storageLabel(args.vault),
      error: args.commit.error ?? "Unknown git commit failure",
      operation: args.commit.operation,
    },
    mutationApplied: args.mutationApplied,
    retrySafe: args.mutationApplied,
    rationale: args.mutationApplied
      ? "Mutation is already persisted on disk; commit can be retried deterministically."
      : "Mutation was not applied; retry may require re-running the operation.",
    instructions: {
      sourceOfTruth: recoveryKind === "manual-exact-git-recovery" ? "attemptedCommit" : "tool-response",
      useExactSubject: recoveryKind === "manual-exact-git-recovery",
      useExactBody: recoveryKind === "manual-exact-git-recovery",
      useExactFiles: recoveryKind === "manual-exact-git-recovery",
      forbidInferenceFromHistory: true,
      forbidInferenceFromTitleOrSummary: true,
      forbidParallelSameVaultRetries: true,
      preferToolReconciliation: recoveryKind === "rerun-tool-call-serial",
      rerunSameToolCallSerially: recoveryKind === "rerun-tool-call-serial",
    },
  };
}

export function formatRetrySummary(retry?: MutationRetryContract): string | undefined {
  if (!retry) {
    return undefined;
  }

  const opLabel = retry.attemptedCommit.operation === "add" ? "add" : "commit";
  const error = retry.attemptedCommit.error;
  const lines: string[] = [];

  switch (retry.recovery.kind) {
    case "rerun-tool-call-serial":
      lines.push("Recovery: rerun same tool call serially");
      lines.push(retry.recovery.reason);
      lines.push("Rerun the same mnemonic tool call one time for the affected vault.");
      lines.push("Do not replay same-vault mutations in parallel.");
      lines.push("Manual git recovery is not authorized for this failure.");
      lines.push("Git failure:");
      lines.push(`${opLabel}: ${error}`);
      break;
    case "manual-exact-git-recovery":
      lines.push("Recovery: manual exact git recovery allowed");
      lines.push(retry.recovery.reason);
      lines.push("Use only the exact values below. Do not infer from git history, note title, summary, or repo state.");
      lines.push("");
      lines.push("Commit subject:");
      lines.push(retry.attemptedCommit.subject);
      if (retry.attemptedCommit.body) {
        lines.push("");
        lines.push("Commit body:");
        lines.push(retry.attemptedCommit.body);
      }
      lines.push("");
      lines.push("Files:");
      for (const file of retry.attemptedCommit.files) {
        lines.push(`- ${file}`);
      }
      lines.push("");
      lines.push("Git failure:");
      lines.push(`${opLabel}: ${error}`);
      break;
    case "no-manual-recovery":
      lines.push("Recovery: no manual recovery authorized");
      lines.push(retry.recovery.reason);
      lines.push("Git failure:");
      lines.push(`${opLabel}: ${error}`);
      break;
    default: {
      const _exhaustive: never = retry.recovery.kind;
      throw new Error(`Unknown recovery kind: ${_exhaustive}`);
    }
  }

  return lines.join("\n");
}

export function formatPersistenceSummary(persistence: PersistenceStatus): string {
  const parts = [
    `Persistence: embedding ${persistence.embedding.status}`,
    `git ${persistence.durability}`,
  ];

  const lines = [parts.join(" | ")];

  if (persistence.embedding.reason) {
    lines[0] += ` | embedding reason=${persistence.embedding.reason}`;
  }

  const retrySummary = formatRetrySummary(persistence.retry);

  if (!retrySummary && persistence.git.commit === "failed" && persistence.git.commitError) {
    const opLabel = persistence.git.commitOperation === "add" ? "add" : "commit";
    lines.push(`Git ${opLabel} error: ${persistence.git.commitError}`);
  }

  if (persistence.git.push === "failed" && persistence.git.pushError) {
    lines.push(`Git push error: ${persistence.git.pushError}`);
  }

  if (retrySummary) {
    lines.push(retrySummary);
  }

  return lines.join("\n");
}

export async function getMutationPushMode(ctx: ServerContext): Promise<MutationPushMode> {
  const latestConfig = await ctx.configStore.load();
  return latestConfig.mutationPushMode;
}

export async function pushAfterMutation(ctx: ServerContext, vault: Vault): Promise<PushResult> {
  const mutationPushMode = await getMutationPushMode(ctx);

  switch (mutationPushMode) {
    case "all":
      return vault.git.pushWithStatus();
    case "main-only":
      return vault.isProject
        ? { status: "skipped" as const, reason: "auto-push-disabled" as const }
        : vault.git.pushWithStatus();
    case "none":
      return { status: "skipped" as const, reason: "auto-push-disabled" as const };
    default: {
      const _exhaustive: never = mutationPushMode;
      throw new Error(`Unknown mutation push mode: ${_exhaustive}`);
    }
  }
}