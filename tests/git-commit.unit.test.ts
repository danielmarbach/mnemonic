import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Vault } from "../src/vault.js";
import type { ServerContext } from "../src/server-context.js";
import type { CommitResult } from "../src/git.js";

const { getCurrentGitBranchMock } = vi.hoisted(() => ({
  getCurrentGitBranchMock: vi.fn(),
}));

vi.mock("../src/project.js", () => ({
  getCurrentGitBranch: getCurrentGitBranchMock,
}));

import { commitVaultWithProtection } from "../src/helpers/git-commit.js";

function makeFakeVault(provenance: Vault["provenance"], extra: Partial<Vault> = {}): Vault {
  const commitWithStatus = vi.fn<() => Promise<CommitResult>>().mockResolvedValue({ status: "committed" });
  return {
    storage: { vaultPath: "/tmp/fake-vault" } as unknown as Vault["storage"],
    git: { commitWithStatus } as unknown as Vault["git"],
    notesRelDir: "notes",
    vaultFolderName: "",
    writable: true,
    provenance,
    ...extra,
  } as Vault;
}

function fakeCtx(policy?: object): ServerContext {
  return {
    configStore: {
      getProjectPolicy: vi.fn().mockResolvedValue(policy),
    },
  } as unknown as ServerContext;
}

describe("commitVaultWithProtection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes through for main vault without branch check", async () => {
    const vault = makeFakeVault("main");
    const ctx = fakeCtx();

    const result = await commitVaultWithProtection({
      ctx,
      vault,
      commitMessage: "test commit",
      files: ["notes/test.md"],
      allowProtectedBranch: false,
      toolName: "test-tool",
    });

    expect(result).toEqual({ status: "committed" });
    expect(vault.git.commitWithStatus).toHaveBeenCalledWith("test commit", ["notes/test.md"], undefined);
    expect(getCurrentGitBranchMock).not.toHaveBeenCalled();
  });

  it("blocks when project-local vault on protected branch with behavior block", async () => {
    const vault = makeFakeVault("project-local", {
      storage: { vaultPath: "/project/.mnemonic" } as unknown as Vault["storage"],
    });
    getCurrentGitBranchMock.mockResolvedValue("main");
    const policy = {
      protectedBranchBehavior: "block",
      protectedBranchPatterns: ["main"],
      projectId: "pid",
      projectName: "PName",
      defaultScope: "project",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const ctx = fakeCtx(policy);

    const result = await commitVaultWithProtection({
      ctx,
      vault,
      commitMessage: "test commit",
      files: ["notes/test.md"],
      allowProtectedBranch: false,
      toolName: "test-tool",
      noteProjectId: "pid",
    });

    expect(result.status).toBe("failed");
    expect((result as any).error).toContain("blocked");
    expect(vault.git.commitWithStatus).not.toHaveBeenCalled();
    expect(getCurrentGitBranchMock).toHaveBeenCalledWith("/project");
  });

  it("succeeds with override when allowProtectedBranch is true", async () => {
    const vault = makeFakeVault("project-local", {
      storage: { vaultPath: "/project/.mnemonic" } as unknown as Vault["storage"],
    });
    getCurrentGitBranchMock.mockResolvedValue("main");
    const policy = {
      protectedBranchBehavior: "block",
      protectedBranchPatterns: ["main"],
      projectId: "pid",
      projectName: "PName",
      defaultScope: "project",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const ctx = fakeCtx(policy);

    const result = await commitVaultWithProtection({
      ctx,
      vault,
      commitMessage: "test commit",
      files: ["notes/test.md"],
      allowProtectedBranch: true,
      toolName: "test-tool",
      noteProjectId: "pid",
    });

    expect(result).toEqual({ status: "committed" });
    expect(vault.git.commitWithStatus).toHaveBeenCalledWith("test commit", ["notes/test.md"], undefined);
  });

  it("blocks project-attached vault on protected branch", async () => {
    const vault = makeFakeVault("project-attached", {
      writable: true,
      attachmentRef: {
        projectSlug: "attached-slug",
        projectName: "Attached Project",
        localPath: "/attached/path",
        branch: "main",
        branchTipHash: "abc",
        writable: true,
      },
    });
    getCurrentGitBranchMock.mockResolvedValue("main");
    const policy = {
      protectedBranchBehavior: "block",
      protectedBranchPatterns: ["main"],
      projectId: "attached-slug",
      projectName: "Attached Project",
      defaultScope: "project",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const ctx = fakeCtx(policy);

    const result = await commitVaultWithProtection({
      ctx,
      vault,
      commitMessage: "test commit",
      files: ["notes/test.md"],
      allowProtectedBranch: false,
      toolName: "test-tool",
    });

    expect(result.status).toBe("failed");
    expect((result as any).error).toContain("blocked");
    expect(vault.git.commitWithStatus).not.toHaveBeenCalled();
    expect(getCurrentGitBranchMock).toHaveBeenCalledWith("/attached/path");
  });

  it("allows project-attached vault when policy behavior is allow", async () => {
    const vault = makeFakeVault("project-attached", {
      writable: true,
      attachmentRef: {
        projectSlug: "attached-slug",
        projectName: "Attached Project",
        localPath: "/attached/path",
        branch: "main",
        branchTipHash: "abc",
        writable: true,
      },
    });
    getCurrentGitBranchMock.mockResolvedValue("main");
    const policy = {
      protectedBranchBehavior: "allow",
      protectedBranchPatterns: ["main"],
      projectId: "attached-slug",
      projectName: "Attached Project",
      defaultScope: "project",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const ctx = fakeCtx(policy);

    const result = await commitVaultWithProtection({
      ctx,
      vault,
      commitMessage: "test commit",
      files: ["notes/test.md"],
      allowProtectedBranch: false,
      toolName: "test-tool",
    });

    expect(result).toEqual({ status: "committed" });
    expect(vault.git.commitWithStatus).toHaveBeenCalledWith("test commit", ["notes/test.md"], undefined);
  });

  it("returns failed for read-only vault", async () => {
    const vault = makeFakeVault("project-attached", { writable: false });
    const ctx = fakeCtx();

    const result = await commitVaultWithProtection({
      ctx,
      vault,
      commitMessage: "test commit",
      files: ["notes/test.md"],
      allowProtectedBranch: false,
      toolName: "test-tool",
    });

    expect(result).toEqual({ status: "failed", reason: "error", error: "Vault is read-only." });
    expect(vault.git.commitWithStatus).not.toHaveBeenCalled();
    expect(getCurrentGitBranchMock).not.toHaveBeenCalled();
  });
});