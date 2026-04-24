import { mkdtemp, rm } from "fs/promises";
import { describe, expect, it } from "vitest";
import os from "os";
import path from "path";

import { callLocalMcpResponse, createPersistentMcpSession, initTestRepo, tempDirs } from "./helpers/mcp.js";

describe("update with semanticPatch", () => {
  it("applies a semantic patch to append content under a heading", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-update-test-"));
    tempDirs.push(vaultDir);
    const repoDir = path.join(vaultDir, "..", "test-project");
    await mkdtemp(repoDir).catch(() => {});
    await initTestRepo(vaultDir, "main");

    const session = await createPersistentMcpSession(vaultDir, { disableGit: true });

    // First remember a note with structure
    const rememberResult = await session.callTool("remember", {
      title: "Test Note for Semantic Patch",
      content: "# Test Note\n\n## Section A\n\nExisting content under A.\n\n## Section B\n\nExisting content under B.\n",
      lifecycle: "temporary",
    });
    const idMatch = rememberResult.text.match(/`([^`]+)`/);
    expect(idMatch).not.toBeNull();
    const noteId = idMatch![1];

    // Now apply a semantic patch to insert after Section A
    const updateResult = await session.callTool("update", {
      id: noteId,
      semanticPatch: [
        {
          selector: { heading: "Section A" },
          operation: { op: "insertAfter", value: "New content inserted after Section A." },
        },
      ],
    });

    expect(updateResult.text).toContain("Updated memory");

    // Verify the note has the new content
    const getResult = await session.callTool("get", {
      ids: [noteId],
    });
    expect(getResult.text).toContain("New content inserted after Section A.");
    expect(getResult.text).toContain("Existing content under B.");

    await session.close();
  }, 15000);

  it("rejects both content and semanticPatch together", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-update-test-"));
    tempDirs.push(vaultDir);
    await initTestRepo(vaultDir, "main");

    const session = await createPersistentMcpSession(vaultDir, { disableGit: true });

    const rememberResult = await session.callTool("remember", {
      title: "Test Mutex",
      content: "# Mutex Test\n\nOriginal.\n",
      lifecycle: "temporary",
    });
    const idMatch = rememberResult.text.match(/`([^`]+)`/);
    expect(idMatch).not.toBeNull();
    const noteId = idMatch![1];

    const updateResult = await session.callTool("update", {
      id: noteId,
      content: "New content.",
      semanticPatch: [{ selector: { heading: "Mutex Test" }, operation: { op: "insertAfter", value: "Patch." } }],
    });

    expect(updateResult.text).toContain("Exactly one of content or semanticPatch must be provided");

    await session.close();
  }, 15000);

  it("rejects heading-specific appends (bug regression)", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-update-test-"));
    tempDirs.push(vaultDir);
    await initTestRepo(vaultDir, "main");

    const session = await createPersistentMcpSession(vaultDir, { disableGit: true });

    const rememberResult = await session.callTool("remember", {
      title: "Heading Bug Test",
      content: "# Heading Bug Test\n\n## Scope\n\n- item a\n- item b\n",
      lifecycle: "temporary",
    });
    const idMatch = rememberResult.text.match(/`([^`]+)`/);
    expect(idMatch).not.toBeNull();
    const noteId = idMatch![1];

    const updateResult = await session.callTool("update", {
      id: noteId,
      semanticPatch: [{ selector: { heading: "Scope" }, operation: { op: "appendChild", value: "new item" } }],
    });

    expect(updateResult.text).toContain("Cannot appendChild to node of type 'heading'");

    await session.close();
  }, 15000);

  it("rejects semanticPatch with missing selector", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-update-test-"));
    tempDirs.push(vaultDir);
    await initTestRepo(vaultDir, "main");

    const session = await createPersistentMcpSession(vaultDir, { disableGit: true });

    const rememberResult = await session.callTool("remember", {
      title: "Test Missing Selector",
      content: "# Test Missing\n\nContent.\n",
      lifecycle: "temporary",
    });
    const idMatch = rememberResult.text.match(/`([^`]+)`/);
    expect(idMatch).not.toBeNull();
    const noteId = idMatch![1];

    const updateResult = await session.callTool("update", {
      id: noteId,
      semanticPatch: [{ selector: { heading: "NonExistent" }, operation: { op: "insertAfter", value: "Won't work." } }],
    });

    expect(updateResult.text).toContain("Semantic patch failed");
    expect(updateResult.text).toContain("Available headings");

    await session.close();
  }, 15000);

  it("allows metadata-only updates without content or semanticPatch", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-update-test-"));
    tempDirs.push(vaultDir);
    await initTestRepo(vaultDir, "main");

    const session = await createPersistentMcpSession(vaultDir, { disableGit: true });

    const rememberResult = await session.callTool("remember", {
      title: "Test Meta Only",
      content: "# Test Meta Only\n\nContent.\n",
      lifecycle: "temporary",
    });
    const idMatch = rememberResult.text.match(/`([^`]+)`/);
    expect(idMatch).not.toBeNull();
    const noteId = idMatch![1];

    const updateResult = await session.callTool("update", {
      id: noteId,
      lifecycle: "permanent",
    });

    expect(updateResult.text).toContain("Updated memory");

    await session.close();
  }, 15000);
});
