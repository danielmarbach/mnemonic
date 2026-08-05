import { describe, expect, it, beforeAll } from "vitest";
import { mkdtemp, mkdir, readdir, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";

import {
  createModernMcpSession,
  elicitAccept,
  elicitDecline,
  ensureBuiltEntryPointReady,
  execFileAsync,
  extractRememberedId,
  initTestRepo,
  initTestVaultRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";

/**
 * Shape of a modern MCP `tools/call` result. The raw `Record<string, unknown>`
 * envelope is narrowed here so elicitation requests and content parts can be
 * indexed without `unknown`-typed optional element access.
 */
interface ToolCallResult {
  resultType?: string;
  inputRequests?: Record<string, unknown>;
  isError?: boolean;
  content?: Array<{ text?: string }>;
}

/**
 * End-to-end tests of the native MRTR (2026-07-28) flow through a real
 * modern client against the built server. The legacy test helpers cannot
 * exercise `input_required` results, so these cover the round-trip mechanics
 * the unit tests can only approximate.
 */

async function setupWritableAttachedVaultFixture() {
  const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mrtr-vault-"));
  const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mrtr-repo-"));
  const bareDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mrtr-bare-"));
  const attachedDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mrtr-attached-"));

  tempDirs.push(vaultDir, repoDir, bareDir, attachedDir);

  await initTestVaultRepo(vaultDir);
  await initTestRepo(repoDir);

  await execFileAsync("git", ["init", "--bare", "-b", "main"], { cwd: bareDir });
  await execFileAsync("git", ["init", "-b", "main"], { cwd: attachedDir });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: attachedDir });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: attachedDir });
  await execFileAsync("git", ["config", "commit.gpgsign", "false"], { cwd: attachedDir });

  const notesDir = path.join(attachedDir, ".mnemonic", "notes");
  await mkdir(notesDir, { recursive: true });

  const noteContent = `---
title: Writable attached note
tags: [integration, mrtr]
lifecycle: permanent
createdAt: "2025-01-01T00:00:00.000Z"
updatedAt: "2025-01-01T00:00:00.000Z"
---
Content from writable attached vault.`;
  await writeFile(path.join(notesDir, "attached-note.md"), noteContent, "utf-8");

  await execFileAsync("git", ["add", ".mnemonic/"], { cwd: attachedDir });
  await execFileAsync(
    "git",
    [
      "-c",
      "user.email=test@example.com",
      "-c",
      "user.name=Test User",
      "commit",
      "-m",
      "chore: add mnemonic notes",
    ],
    { cwd: attachedDir },
  );
  await execFileAsync("git", ["remote", "add", "origin", bareDir], { cwd: attachedDir });
  await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd: attachedDir });
  await execFileAsync("git", ["remote", "set-head", "origin", "--auto"], { cwd: attachedDir });

  return { vaultDir, repoDir, attachedDir };
}

describe("MRTR native round-trips (modern 2026-07-28 client)", () => {
  beforeAll(async () => {
    await ensureBuiltEntryPointReady();
  }, 120000);

  it("elicits branch consent via input_required and commits after acceptance", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mrtr-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mrtr-repo-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestVaultRepo(vaultDir);
    await initTestRepo(repoDir, "main");
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const session = await createModernMcpSession(vaultDir, {
        ollamaUrl: embeddingServer.url,
        disableGit: false,
      });

      try {
        // Round 1: the protected-branch check blocks and returns input_required.
        const raw = (await session.callToolRaw("remember", {
          title: "MRTR protected branch note",
          content: "Should be committed after branch consent.",
          tags: ["integration", "mrtr"],
          summary: "Protected branch MRTR consent test",
          cwd: repoDir,
          scope: "project",
        })) as ToolCallResult;

        expect(raw.resultType).toBe("input_required");
        const branchRequest = raw.inputRequests?.["protectedBranch"] as {
          method?: string;
          params?: { message?: string };
        };
        expect(branchRequest?.method).toBe("elicitation/create");
        expect(branchRequest?.params?.message).toContain("main");

        // Round 2: accept the consent; the note must be written and committed.
        const accepted = (await session.callTool(
          "remember",
          {
            title: "MRTR protected branch note",
            content: "Should be committed after branch consent.",
            tags: ["integration", "mrtr"],
            summary: "Protected branch MRTR consent test",
            cwd: repoDir,
            scope: "project",
          },
          (requests) => {
            expect(Object.keys(requests)).toEqual(["protectedBranch"]);
            return {
              protectedBranch: elicitAccept({ allowProtectedBranch: true }),
            };
          },
        )) as ToolCallResult;

        const acceptedId = extractRememberedId(accepted.content?.[0]?.text ?? "");
        await expect(
          stat(path.join(repoDir, ".mnemonic", "notes", `${acceptedId}.md`)),
        ).resolves.toBeDefined();
      } finally {
        await session.close();
      }
    } finally {
      await embeddingServer.close();
    }
  }, 60000);

  it("does not write when the user declines the branch consent", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mrtr-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mrtr-repo-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestVaultRepo(vaultDir);
    await initTestRepo(repoDir, "main");
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const session = await createModernMcpSession(vaultDir, {
        ollamaUrl: embeddingServer.url,
        disableGit: false,
      });

      try {
        const declined = (await session.callTool(
          "remember",
          {
            title: "MRTR declined note",
            content: "Must not be stored when the user declines.",
            tags: ["integration", "mrtr"],
            summary: "Declined MRTR branch consent test",
            cwd: repoDir,
            scope: "project",
          },
          () => ({
            protectedBranch: elicitDecline(),
          }),
        )) as ToolCallResult;

        expect(declined.isError).toBe(true);
        expect(declined.content?.[0]?.text).toContain("Protected branch check");

        const notes = await readdir(path.join(repoDir, ".mnemonic", "notes")).catch(() => []);
        expect(notes.filter((name) => name.endsWith(".md"))).toEqual([]);
      } finally {
        await session.close();
      }
    } finally {
      await embeddingServer.close();
    }
  }, 60000);

  it("elicits the write scope on an unadopted project and stores globally when chosen", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mrtr-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mrtr-repo-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestVaultRepo(vaultDir);
    await initTestRepo(repoDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const session = await createModernMcpSession(vaultDir, {
        ollamaUrl: embeddingServer.url,
        disableGit: false,
      });

      try {
        const raw = (await session.callToolRaw("remember", {
          title: "MRTR scope choice note",
          content: "Stored where the user picks.",
          tags: ["integration", "mrtr"],
          summary: "MRTR scope selection test",
          cwd: repoDir,
        })) as ToolCallResult;

        expect(raw.resultType).toBe("input_required");
        const scopeRequest = raw.inputRequests?.["writeScope"] as {
          params?: { requestedSchema?: { properties?: Record<string, unknown> } };
        };
        const scopeProp = scopeRequest?.params?.requestedSchema?.properties?.["scope"] as
          { enum?: string[] } | undefined;
        expect(scopeProp?.enum).toEqual(["project", "global"]);

        const chosen = (await session.callTool(
          "remember",
          {
            title: "MRTR scope choice note",
            content: "Stored where the user picks.",
            tags: ["integration", "mrtr"],
            summary: "MRTR scope selection test",
            cwd: repoDir,
          },
          () => ({
            writeScope: elicitAccept({ scope: "global" }),
          }),
        )) as ToolCallResult;

        const chosenId = extractRememberedId(chosen.content?.[0]?.text ?? "");
        expect(chosen.content?.[0]?.text).toContain("stored=global");
        await expect(stat(path.join(vaultDir, "notes", `${chosenId}.md`))).resolves.toBeDefined();
      } finally {
        await session.close();
      }
    } finally {
      await embeddingServer.close();
    }
  }, 60000);

  it("writes into a writable attached vault when the vault picker selects it", async () => {
    const { vaultDir, repoDir, attachedDir } = await setupWritableAttachedVaultFixture();
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const session = await createModernMcpSession(vaultDir, {
        ollamaUrl: embeddingServer.url,
        disableGit: false,
      });

      try {
        const addResult = (await session.callTool(
          "add_attachment",
          {
            cwd: repoDir,
            localPath: attachedDir,
            writable: true,
            pushBranch: "main",
          },
          () => ({}),
        )) as ToolCallResult;
        const slugMatch = (addResult.content?.[0]?.text ?? "").match(/\(([^)]+)\) at /);
        expect(slugMatch).not.toBeNull();
        const attachedSlug = slugMatch?.[1];
        expect(attachedSlug).toBeTruthy();
        const attachedKey = `attached:${attachedSlug}`;

        const raw = (await session.callToolRaw("remember", {
          title: "MRTR vault picker note",
          content: "Should land in the writable attached vault.",
          tags: ["integration", "mrtr"],
          summary: "MRTR vault selection test",
          cwd: repoDir,
          scope: "project",
        })) as ToolCallResult;

        expect(raw.resultType).toBe("input_required");
        const vaultRequest = raw.inputRequests?.["vault"] as {
          params?: { requestedSchema?: { properties?: Record<string, unknown> } };
        };
        const vaultProp = vaultRequest?.params?.requestedSchema?.properties?.["vault"] as
          { enum?: string[] } | undefined;
        expect(vaultProp?.enum).toContain("project");
        expect(vaultProp?.enum).toContain(attachedKey);

        const chosen = (await session.callTool(
          "remember",
          {
            title: "MRTR vault picker note",
            content: "Should land in the writable attached vault.",
            tags: ["integration", "mrtr"],
            summary: "MRTR vault selection test",
            cwd: repoDir,
            scope: "project",
          },
          () => ({
            vault: elicitAccept({ vault: attachedKey }),
          }),
        )) as ToolCallResult;

        const chosenId = extractRememberedId(chosen.content?.[0]?.text ?? "");
        expect(chosen.content?.[0]?.text).toContain(attachedKey);
        await expect(
          stat(path.join(attachedDir, ".mnemonic", "notes", `${chosenId}.md`)),
        ).resolves.toBeDefined();
      } finally {
        await session.close();
      }
    } finally {
      await embeddingServer.close();
    }
  }, 60000);

  it("chains scope and branch elicitations across rounds on an unadopted protected branch", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mrtr-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mrtr-repo-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestVaultRepo(vaultDir);
    await initTestRepo(repoDir, "main");
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const session = await createModernMcpSession(vaultDir, {
        ollamaUrl: embeddingServer.url,
        disableGit: false,
      });

      try {
        const raw = (await session.callToolRaw("remember", {
          title: "MRTR chained rounds note",
          content: "Exercises scope then branch consent across rounds.",
          tags: ["integration", "mrtr"],
          summary: "MRTR chained elicitation test",
          cwd: repoDir,
        })) as ToolCallResult;

        expect(raw.resultType).toBe("input_required");
        expect(raw.inputRequests?.["writeScope"]).toBeDefined();

        const result = (await session.callTool(
          "remember",
          {
            title: "MRTR chained rounds note",
            content: "Exercises scope then branch consent across rounds.",
            tags: ["integration", "mrtr"],
            summary: "MRTR chained elicitation test",
            cwd: repoDir,
          },
          (requests) => {
            const responses: Record<string, unknown> = {};
            if (requests["writeScope"]) {
              responses["writeScope"] = elicitAccept({ scope: "project" });
            }
            if (requests["protectedBranch"]) {
              responses["protectedBranch"] = elicitAccept({ allowProtectedBranch: true });
            }
            return responses;
          },
        )) as ToolCallResult;

        const resultId = extractRememberedId(result.content?.[0]?.text ?? "");
        await expect(
          stat(path.join(repoDir, ".mnemonic", "notes", `${resultId}.md`)),
        ).resolves.toBeDefined();
      } finally {
        await session.close();
      }
    } finally {
      await embeddingServer.close();
    }
  }, 60000);
});
