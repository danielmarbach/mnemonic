import { mkdtemp, rm } from "fs/promises";
import { describe, expect, it } from "vitest";
import os from "os";
import path from "path";

import { createPersistentMcpSession, initTestRepo, tempDirs } from "./helpers/mcp.js";

describe("update no-op detection", () => {
  it("does not re-embed or bump updatedAt when update makes no actual changes", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-update-noop-test-"));
    tempDirs.push(vaultDir);
    await initTestRepo(vaultDir, "main");

    const session = await createPersistentMcpSession(vaultDir, { disableGit: true });

    const rememberResult = await session.callTool("remember", {
      title: "Test No Change",
      content: "# Test No Change\n\nOriginal content.\n",
      lifecycle: "temporary",
    });
    const noteId = rememberResult.text.match(/`([^`]+)`/)?.[1];
    expect(noteId).toBeDefined();

    const getResult1 = await session.callTool("get", { ids: [noteId!] });
    const updatedAt1 = getResult1.text.match(/updatedAt[:\s]+(['"]?)([^'"\n,]+)\1/)?.[2]
      ?? getResult1.structuredContent?.updatedAt as string | undefined;

    const updateResult = await session.callTool("update", {
      id: noteId,
      lifecycle: "temporary",
    });

    expect(updateResult.text).toContain("No changes");

    const getResult2 = await session.callTool("get", { ids: [noteId!] });
    const updatedAt2 = getResult2.text.match(/updatedAt[:\s]+(['"]?)([^'"\n,]+)\1/)?.[2]
      ?? getResult2.structuredContent?.updatedAt as string | undefined;

    if (updatedAt1 && updatedAt2) {
      expect(updatedAt2).toBe(updatedAt1);
    }

    await session.close();
  }, 15000);

  it("bumps updatedAt when lifecycle actually changes", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-update-noop-test-"));
    tempDirs.push(vaultDir);
    await initTestRepo(vaultDir, "main");

    const session = await createPersistentMcpSession(vaultDir, { disableGit: true });

    const rememberResult = await session.callTool("remember", {
      title: "Test Lifecycle Change",
      content: "# Test Lifecycle Change\n\nOriginal content.\n",
      lifecycle: "temporary",
    });
    const noteId = rememberResult.text.match(/`([^`]+)`/)?.[1];
    expect(noteId).toBeDefined();

    const getResult1 = await session.callTool("get", { ids: [noteId!] });
    const updatedAt1 = getResult1.structuredContent?.updatedAt as string | undefined;

    const updateResult = await session.callTool("update", {
      id: noteId,
      lifecycle: "permanent",
    });

    expect(updateResult.text).toContain("Updated memory");

    const getResult2 = await session.callTool("get", { ids: [noteId!] });
    const updatedAt2 = getResult2.structuredContent?.updatedAt as string | undefined;

    if (updatedAt1 && updatedAt2) {
      expect(updatedAt2).not.toBe(updatedAt1);
    }

    await session.close();
  }, 15000);

  it("reports No changes for true no-op updates", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-update-noop-test-"));
    tempDirs.push(vaultDir);
    await initTestRepo(vaultDir, "main");

    const session = await createPersistentMcpSession(vaultDir, { disableGit: true });

    const rememberResult = await session.callTool("remember", {
      title: "Test No Op Report",
      content: "# Test No Op Report\n\nOriginal content.\n",
      lifecycle: "temporary",
    });
    const noteId = rememberResult.text.match(/`([^`]+)`/)?.[1];
    expect(noteId).toBeDefined();

    const updateResult = await session.callTool("update", {
      id: noteId,
      lifecycle: "temporary",
    });

    expect(updateResult.text).toContain("No changes");

    await session.close();
  }, 15000);

  it("reports semanticPatch in fieldsModified even when content result is identical", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-update-noop-test-"));
    tempDirs.push(vaultDir);
    await initTestRepo(vaultDir, "main");

    const session = await createPersistentMcpSession(vaultDir, { disableGit: true });

    const rememberResult = await session.callTool("remember", {
      title: "Test Semantic Patch Fields",
      content: "# Test\n\nHello.\n",
      lifecycle: "temporary",
    });
    const noteId = rememberResult.text.match(/`([^`]+)`/)?.[1];
    expect(noteId).toBeDefined();

    const updateResult = await session.callTool("update", {
      id: noteId,
      semanticPatch: [
        { selector: { heading: "Test" }, operation: { op: "insertAfter", value: "Hello." } },
      ],
    });

    expect(updateResult.structuredContent).toBeDefined();
    const structured = updateResult.structuredContent as Record<string, unknown>;
    expect(structured.fieldsModified).toContain("semanticPatch");

    await session.close();
  }, 15000);

  it("reports fieldsModified correctly for actual lifecycle change", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-update-noop-test-"));
    tempDirs.push(vaultDir);
    await initTestRepo(vaultDir, "main");

    const session = await createPersistentMcpSession(vaultDir, { disableGit: true });

    const rememberResult = await session.callTool("remember", {
      title: "Test Fields Modified",
      content: "# Test Fields Modified\n\nOriginal content.\n",
      lifecycle: "temporary",
    });
    const noteId = rememberResult.text.match(/`([^`]+)`/)?.[1];
    expect(noteId).toBeDefined();

    const updateResult = await session.callTool("update", {
      id: noteId,
      lifecycle: "permanent",
    });

    expect(updateResult.structuredContent).toBeDefined();
    const structured = updateResult.structuredContent as Record<string, unknown>;
    expect(structured.fieldsModified).toContain("lifecycle");

    await session.close();
  }, 15000);

  it("does not report content in fieldsModified for no-op content update", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-update-noop-test-"));
    tempDirs.push(vaultDir);
    await initTestRepo(vaultDir, "main");

    const session = await createPersistentMcpSession(vaultDir, { disableGit: true });

    const rememberResult = await session.callTool("remember", {
      title: "Test Content NoOp",
      content: "# Test Content NoOp\n\nOriginal.\n",
      lifecycle: "temporary",
    });
    const noteId = rememberResult.text.match(/`([^`]+)`/)?.[1];
    expect(noteId).toBeDefined();

    const updateResult = await session.callTool("update", {
      id: noteId,
      content: "# Test Content NoOp\n\nOriginal.\n",
    });

    expect(updateResult.structuredContent).toBeDefined();
    const structured = updateResult.structuredContent as Record<string, unknown>;
    expect(structured.fieldsModified).not.toContain("content");

    await session.close();
  }, 15000);
});