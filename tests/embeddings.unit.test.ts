import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { Storage, type Note } from "../src/storage.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempStorage(): Promise<Storage> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-embeddings-"));
  tempDirs.push(dir);
  const storage = new Storage(dir);
  await storage.init();
  return storage;
}

function createTestNote(id: string, title: string, content: string): Note {
  const now = new Date().toISOString();
  return {
    id,
    title,
    content,
    tags: ["test"],
    lifecycle: "permanent",
    createdAt: now,
    updatedAt: now,
  };
}

describe("Storage embedding lifecycle", () => {
  it("creates note without requiring embedding", async () => {
    const storage = await createTempStorage();
    const note = createTestNote("test-note", "Test Title", "Test content");

    await storage.writeNote(note);

    const retrieved = await storage.readNote("test-note");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.title).toBe("Test Title");

    // Embedding is optional
    const embedding = await storage.readEmbedding("test-note");
    expect(embedding).toBeNull();
  });

  it("stores and retrieves embeddings", async () => {
    const storage = await createTempStorage();
    const note = createTestNote("test-note", "Test Title", "Test content");

    await storage.writeNote(note);
    await storage.writeEmbedding({
      id: "test-note",
      model: "test-model",
      embedding: [0.1, 0.2, 0.3],
      updatedAt: new Date().toISOString(),
    });

    const retrieved = await storage.readEmbedding("test-note");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.model).toBe("test-model");
    expect(retrieved?.embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it("deletes both note and embedding on deleteNote", async () => {
    const storage = await createTempStorage();
    const note = createTestNote("test-note", "Test Title", "Test content");

    await storage.writeNote(note);
    await storage.writeEmbedding({
      id: "test-note",
      model: "test-model",
      embedding: [0.1, 0.2, 0.3],
      updatedAt: new Date().toISOString(),
    });

    const deleted = await storage.deleteNote("test-note");
    expect(deleted).toBe(true);

    // Both note and embedding should be gone
    const retrievedNote = await storage.readNote("test-note");
    expect(retrievedNote).toBeNull();

    const retrievedEmbedding = await storage.readEmbedding("test-note");
    expect(retrievedEmbedding).toBeNull();
  });

  it("deleteNote returns false for non-existent note", async () => {
    const storage = await createTempStorage();

    const deleted = await storage.deleteNote("non-existent");
    expect(deleted).toBe(false);
  });

  it("deleteNote succeeds even without embedding", async () => {
    const storage = await createTempStorage();
    const note = createTestNote("test-note", "Test Title", "Test content");

    await storage.writeNote(note);
    // No embedding written

    const deleted = await storage.deleteNote("test-note");
    expect(deleted).toBe(true);

    const retrieved = await storage.readNote("test-note");
    expect(retrieved).toBeNull();
  });

  it("lists embeddings separately from notes", async () => {
    const storage = await createTempStorage();

    // Create note with embedding
    const note1 = createTestNote("note-1", "Title 1", "Content 1");
    await storage.writeNote(note1);
    await storage.writeEmbedding({
      id: "note-1",
      model: "test-model",
      embedding: [0.1, 0.2],
      updatedAt: new Date().toISOString(),
    });

    // Create note without embedding
    const note2 = createTestNote("note-2", "Title 2", "Content 2");
    await storage.writeNote(note2);

    const embeddings = await storage.listEmbeddings();
    expect(embeddings).toHaveLength(1);
    expect(embeddings[0]?.id).toBe("note-1");

    const notes = await storage.listNotes();
    expect(notes).toHaveLength(2);
  });

  it("allows updating embedding independently of note", async () => {
    const storage = await createTempStorage();
    const note = createTestNote("test-note", "Test Title", "Test content");

    await storage.writeNote(note);
    await storage.writeEmbedding({
      id: "test-note",
      model: "model-v1",
      embedding: [0.1, 0.2],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    // Update embedding with new model
    await storage.writeEmbedding({
      id: "test-note",
      model: "model-v2",
      embedding: [0.3, 0.4],
      updatedAt: "2026-01-02T00:00:00.000Z",
    });

    const retrieved = await storage.readEmbedding("test-note");
    expect(retrieved?.model).toBe("model-v2");
    expect(retrieved?.embedding).toEqual([0.3, 0.4]);
  });
});

describe("Embedding consistency scenarios", () => {
  it("maintains consistency through note update cycles", async () => {
    const storage = await createTempStorage();

    // Create initial note with embedding
    const note = createTestNote("evolving-note", "Version 1", "Initial content");
    await storage.writeNote(note);
    await storage.writeEmbedding({
      id: "evolving-note",
      model: "test-model",
      embedding: [0.1, 0.2, 0.3],
      updatedAt: new Date().toISOString(),
    });

    // Update note (simulating update command)
    const updatedNote: Note = {
      ...note,
      title: "Version 2",
      content: "Updated content",
      updatedAt: new Date().toISOString(),
    };
    await storage.writeNote(updatedNote);

    // Note should be updated
    const retrievedNote = await storage.readNote("evolving-note");
    expect(retrievedNote?.title).toBe("Version 2");
    expect(retrievedNote?.content).toBe("Updated content");

    // Embedding should still exist (update command would regenerate it)
    const retrievedEmbedding = await storage.readEmbedding("evolving-note");
    expect(retrievedEmbedding).not.toBeNull();
    expect(retrievedEmbedding?.embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it("handles concurrent vault operations", async () => {
    const dir1 = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-vault1-"));
    const dir2 = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-vault2-"));
    tempDirs.push(dir1, dir2);

    const sourceStorage = new Storage(dir1);
    const targetStorage = new Storage(dir2);
    await sourceStorage.init();
    await targetStorage.init();

    // Create note in source vault
    const note = createTestNote("moved-note", "Moved Note", "Content to move");
    await sourceStorage.writeNote(note);
    await sourceStorage.writeEmbedding({
      id: "moved-note",
      model: "test-model",
      embedding: [0.5, 0.6, 0.7],
      updatedAt: new Date().toISOString(),
    });

    // Move to target vault (simulating move_memory)
    const embedding = await sourceStorage.readEmbedding("moved-note");
    await targetStorage.writeNote(note);
    if (embedding) {
      await targetStorage.writeEmbedding(embedding);
    }
    await sourceStorage.deleteNote("moved-note");

    // Verify target has both
    const targetNote = await targetStorage.readNote("moved-note");
    const targetEmbedding = await targetStorage.readEmbedding("moved-note");
    expect(targetNote).not.toBeNull();
    expect(targetEmbedding).not.toBeNull();
    expect(targetEmbedding?.embedding).toEqual([0.5, 0.6, 0.7]);

    // Verify source is clean
    const sourceNote = await sourceStorage.readNote("moved-note");
    const sourceEmbedding = await sourceStorage.readEmbedding("moved-note");
    expect(sourceNote).toBeNull();
    expect(sourceEmbedding).toBeNull();
  });
});
