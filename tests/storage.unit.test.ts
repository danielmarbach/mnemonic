import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Storage, type Note, type EmbeddingRecord } from "../src/storage.js";
import {
  validateRelatedTo,
  validateEmbeddingRecord,
  validateNoteProjection,
} from "../src/validation.js";
import type { EmbeddingModelId, ISO8601DateString, MemoryId } from "../src/brands.js";
import * as fs from "fs/promises";
import * as path from "path";
import os from "os";

// Shared byte counter populated by the fs/promises mock below, so a test can
// assert how many bytes a read path actually consumes (e.g. metadata reads must
// skip the body). Reset it at the start of the test that inspects it.
const frontmatterReadBytes = vi.hoisted(() => ({ total: 0 }));

// Wrap `open` (streamed reads) and `readFile` (whole-file reads) to count
// bytes returned; forward everything else unchanged so all other storage
// behavior is unaffected. Both the default and namespace export must point at
// the wrapped object because storage.ts imports `fs/promises` as a default
// while tests use the namespace.
vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  const wrapped = {
    ...actual,
    open: (async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      const originalRead = handle.read.bind(handle);
      handle.read = ((...args: Parameters<typeof handle.read>) =>
        originalRead(...args).then((result) => {
          frontmatterReadBytes.total += result.bytesRead;
          return result;
        })) as typeof handle.read;
      return handle;
    }) as typeof actual.open,
    readFile: ((...args: Parameters<typeof actual.readFile>) => {
      return actual.readFile(...args).then((result) => {
        frontmatterReadBytes.total += Buffer.byteLength(result);
        return result;
      });
    }) as typeof actual.readFile,
  };
  return { ...wrapped, default: wrapped };
});

describe("Storage", () => {
  let tempDir: string;
  let storage: Storage;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-storage-test-"));
    storage = new Storage(tempDir);
    await storage.init();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Note Operations", () => {
    it("should write and read a complete note with all fields", async () => {
      const now = new Date().toISOString() as ISO8601DateString;
      const note: Note = {
        id: "test-note-1" as MemoryId,
        title: "Test Note",
        content: "This is a test note.",
        tags: ["test", "unit"],
        lifecycle: "permanent",
        project: "test-project",
        projectName: "Test Project",
        relatedTo: [{ id: "related-1" as MemoryId, type: "related-to" }],
        createdAt: now,
        updatedAt: now,
        memoryVersion: 1,
      };

      await storage.writeNote(note);
      const read = await storage.readNote(note.id);

      expect(read).toEqual(note);
    });

    it("should handle backward compatibility with old schema versions", async () => {
      const oldNote = {
        id: "old-note" as MemoryId,
        title: "Old Note",
        content: "Legacy note without memoryVersion",
        tags: ["legacy"],
        project: "old-project",
        createdAt: "2023-01-01T00:00:00.000Z",
        updatedAt: "2023-01-01T00:00:00.000Z" as ISO8601DateString,
        // memoryVersion intentionally missing
      };

      // Write directly to file bypassing writeNote to simulate old data
      const notesDir = path.join(tempDir, "notes");
      const frontmatter = {
        id: oldNote.id,
        title: oldNote.title,
        tags: oldNote.tags,
        project: oldNote.project,
        createdAt: oldNote.createdAt,
        updatedAt: oldNote.updatedAt,
        // No memoryVersion
      };

      const content = `---\n${JSON.stringify(frontmatter, null, 2)}\n---\n\n${oldNote.content}`;
      await fs.writeFile(path.join(notesDir, `${oldNote.id}.md`), content);

      const read = await storage.readNote(oldNote.id);

      expect(read).toBeTruthy();
      expect(read!.id).toBe(oldNote.id);
      expect(read!.title).toBe(oldNote.title);
      expect(read!.lifecycle).toBe("permanent");
      expect(read!.memoryVersion).toBe(0); // Legacy notes normalize to pre-v0.2.0 schema
    });

    it("should normalize invalid lifecycle values to permanent", async () => {
      const notesDir = path.join(tempDir, "notes");
      const content = `---
title: Invalid lifecycle
tags: []
lifecycle: someday
createdAt: 2023-01-01T00:00:00.000Z
updatedAt: 2023-01-01T00:00:00.000Z
---

Body`;

      await fs.writeFile(path.join(notesDir, "invalid-lifecycle.md"), content, "utf-8");

      const read = await storage.readNote("invalid-lifecycle" as MemoryId);
      expect(read?.lifecycle).toBe("permanent");
    });

    it("should read explicit role, importance, and alwaysLoad metadata from frontmatter", async () => {
      const notesDir = path.join(tempDir, "notes");
      const content = `---
title: Metadata note
tags: []
lifecycle: permanent
role: decision
importance: high
alwaysLoad: true
createdAt: 2023-01-01T00:00:00.000Z
updatedAt: 2023-01-01T00:00:00.000Z
---

Body`;

      await fs.writeFile(path.join(notesDir, "metadata-note.md"), content, "utf-8");

      const read = await storage.readNote("metadata-note" as MemoryId);

      expect(read?.role).toBe("decision");
      expect(read?.importance).toBe("high");
      expect(read?.alwaysLoad).toBe(true);
    });

    it("should treat unsupported role, importance, and alwaysLoad values as absent", async () => {
      const notesDir = path.join(tempDir, "notes");
      const content = `---
title: Invalid metadata note
tags: []
lifecycle: permanent
role: invalid-role
importance: urgent
alwaysLoad: yes
createdAt: 2023-01-01T00:00:00.000Z
updatedAt: 2023-01-01T00:00:00.000Z
---

Body`;

      await fs.writeFile(path.join(notesDir, "invalid-metadata-note.md"), content, "utf-8");

      const read = await storage.readNote("invalid-metadata-note" as MemoryId);

      expect(read).toBeTruthy();
      expect(read?.role).toBeUndefined();
      expect(read?.importance).toBeUndefined();
      expect(read?.alwaysLoad).toBeUndefined();
    });

    it("should round-trip explicit metadata and only serialize explicitly present values", async () => {
      const now = new Date().toISOString() as ISO8601DateString;
      const note: Note = {
        id: "metadata-round-trip" as MemoryId,
        title: "Metadata Round Trip",
        content: "Round trip body",
        tags: ["metadata"],
        lifecycle: "permanent",
        role: "summary",
        importance: "low",
        alwaysLoad: true,
        createdAt: now,
        updatedAt: now,
      };

      await storage.writeNote(note);

      const raw = await fs.readFile(path.join(tempDir, "notes", `${note.id}.md`), "utf-8");
      expect(raw).toContain("role: summary");
      expect(raw).toContain("importance: low");
      expect(raw).toContain("alwaysLoad: true");

      const read = await storage.readNote(note.id);

      expect(read).toEqual({
        ...note,
        memoryVersion: 0,
        project: undefined,
        projectName: undefined,
        relatedTo: undefined,
      });

      const noteWithoutMetadata: Note = {
        id: "metadata-absent" as MemoryId,
        title: "Metadata Absent",
        content: "No metadata body",
        tags: [],
        lifecycle: "permanent",
        createdAt: now,
        updatedAt: now,
      };

      await storage.writeNote(noteWithoutMetadata);

      const rawWithoutMetadata = await fs.readFile(
        path.join(tempDir, "notes", `${noteWithoutMetadata.id}.md`),
        "utf-8",
      );
      expect(rawWithoutMetadata).not.toContain("role:");
      expect(rawWithoutMetadata).not.toContain("importance:");
      expect(rawWithoutMetadata).not.toContain("alwaysLoad:");
    });

    it("should round-trip explicit alwaysLoad false metadata", async () => {
      const now = new Date().toISOString() as ISO8601DateString;
      const note: Note = {
        id: "metadata-alwaysload-false" as MemoryId,
        title: "AlwaysLoad False",
        content: "Explicit false body",
        tags: [],
        lifecycle: "permanent",
        alwaysLoad: false,
        createdAt: now,
        updatedAt: now,
      };

      await storage.writeNote(note);

      const raw = await fs.readFile(path.join(tempDir, "notes", `${note.id}.md`), "utf-8");
      expect(raw).toContain("alwaysLoad: false");

      const read = await storage.readNote(note.id);

      expect(read).toEqual({
        ...note,
        memoryVersion: 0,
        project: undefined,
        projectName: undefined,
        relatedTo: undefined,
        role: undefined,
        importance: undefined,
      });
    });

    it("should return null for non-existent note", async () => {
      const read = await storage.readNote("non-existent" as MemoryId);
      expect(read).toBeNull();
    });

    it("should round-trip relationships with vaultPath for cross-vault links", async () => {
      const now = new Date().toISOString() as ISO8601DateString;
      const note: Note = {
        id: "cross-vault-note" as MemoryId,
        title: "Cross Vault Note",
        content: "Has a cross-vault relationship.",
        tags: [],
        lifecycle: "permanent",
        relatedTo: [
          { id: "other-note" as MemoryId, type: "related-to", vaultPath: "/other/vault/path" },
          { id: "same-vault-note" as MemoryId, type: "explains" },
        ],
        createdAt: now,
        updatedAt: now,
      };

      await storage.writeNote(note);
      const read = await storage.readNote(note.id);

      expect(read).toBeTruthy();
      expect(read!.relatedTo).toHaveLength(2);
      expect(read!.relatedTo![0]).toEqual({
        id: "other-note" as MemoryId,
        type: "related-to",
        vaultPath: "/other/vault/path",
      });
      expect(read!.relatedTo![1]).toEqual({ id: "same-vault-note" as MemoryId, type: "explains" });
      expect(read!.relatedTo![1]).not.toHaveProperty("vaultPath");
    });

    it("should remove cross-vault relationships by filtering relatedTo", async () => {
      const now = new Date().toISOString() as ISO8601DateString;
      const note: Note = {
        id: "remove-rel-note" as MemoryId,
        title: "Remove Relationship Note",
        content: "Testing relationship removal.",
        tags: [],
        lifecycle: "permanent",
        relatedTo: [
          { id: "target-a" as MemoryId, type: "related-to", vaultPath: "/other/vault" },
          { id: "target-b" as MemoryId, type: "explains" },
        ],
        createdAt: now,
        updatedAt: now,
      };

      await storage.writeNote(note);

      const filtered = (note.relatedTo ?? []).filter((r) => r.id !== "target-a");
      await storage.writeNote({
        ...note,
        relatedTo: filtered,
        updatedAt: new Date().toISOString() as ISO8601DateString,
      });

      const read = await storage.readNote(note.id);
      expect(read!.relatedTo).toHaveLength(1);
      expect(read!.relatedTo![0]).toEqual({ id: "target-b" as MemoryId, type: "explains" });
    });

    it("should list all notes without filter", async () => {
      const now = new Date().toISOString() as ISO8601DateString;
      const notes: Note[] = [
        {
          id: "note-1" as MemoryId,
          title: "Note 1",
          content: "Content 1",
          tags: [],
          lifecycle: "permanent",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "note-2" as MemoryId,
          title: "Note 2",
          content: "Content 2",
          tags: [],
          lifecycle: "permanent",
          createdAt: now,
          updatedAt: now,
        },
      ];

      for (const note of notes) {
        await storage.writeNote(note);
      }

      const listed = await storage.listNotes();

      expect(listed).toHaveLength(2);
      expect(listed.map((n) => n.id).sort()).toEqual(["note-1", "note-2"]);
    });

    it("should filter notes by project", async () => {
      const now = new Date().toISOString() as ISO8601DateString;
      const notes: Note[] = [
        {
          id: "note-1" as MemoryId,
          title: "Note 1",
          content: "Content 1",
          tags: [],
          lifecycle: "permanent",
          project: "project-a",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "note-2" as MemoryId,
          title: "Note 2",
          content: "Content 2",
          tags: [],
          lifecycle: "permanent",
          project: "project-b",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "note-3" as MemoryId,
          title: "Note 3",
          content: "Content 3",
          tags: [],
          lifecycle: "permanent",
          createdAt: now,
          updatedAt: now,
          // No project = global
        },
      ];

      for (const note of notes) {
        await storage.writeNote(note);
      }

      const projectA = await storage.listNotes({ project: "project-a" });
      const projectB = await storage.listNotes({ project: "project-b" });
      const global = await storage.listNotes({ project: null });

      expect(projectA).toHaveLength(1);
      expect(projectA[0]!.id).toBe("note-1");

      expect(projectB).toHaveLength(1);
      expect(projectB[0]!.id).toBe("note-2");

      expect(global).toHaveLength(1);
      expect(global[0]!.id).toBe("note-3");
    });

    it("should handle malformed markdown gracefully", async () => {
      const notesDir = path.join(tempDir, "notes");

      // Create a malformed markdown file (no frontmatter)
      await fs.writeFile(path.join(notesDir, "malformed.md"), "This has no frontmatter");

      // Should not throw, just return null or skip
      const read = await storage.readNote("malformed" as MemoryId);
      // The implementation returns null for notes without proper frontmatter
      expect(read).toBeNull();
    });

    it("should handle frontmatter parsing edge cases", async () => {
      const notesDir = path.join(tempDir, "notes");

      // Invalid YAML in frontmatter
      await fs.writeFile(
        path.join(notesDir, "invalid-yaml.md"),
        `---\ninvalid: yaml: here:::\n---\n\nContent`,
      );

      const read = await storage.readNote("invalid-yaml" as MemoryId);
      expect(read).toBeNull(); // Should handle gracefully
    });

    it("should delete a note", async () => {
      const now = new Date().toISOString() as ISO8601DateString;
      const note: Note = {
        id: "note-to-delete" as MemoryId,
        title: "Delete Me",
        content: "This will be deleted",
        tags: [],
        lifecycle: "permanent",
        createdAt: now,
        updatedAt: now,
      };

      await storage.writeNote(note);
      expect(await storage.readNote(note.id)).toBeTruthy();

      const deleted = await storage.deleteNote(note.id);
      expect(deleted).toBe(true);

      expect(await storage.readNote(note.id)).toBeNull();
    });

    it("should return false when deleting non-existent note", async () => {
      const deleted = await storage.deleteNote("non-existent" as MemoryId);
      expect(deleted).toBe(false);
    });

    it("should update an existing note", async () => {
      const now = new Date().toISOString() as ISO8601DateString;
      const note: Note = {
        id: "note-to-update" as MemoryId,
        title: "Original Title",
        content: "Original content",
        tags: ["original"],
        lifecycle: "permanent",
        createdAt: now,
        updatedAt: now,
      };

      await storage.writeNote(note);

      const updated: Note = {
        ...note,
        title: "Updated Title",
        content: "Updated content",
        tags: ["updated"],
        updatedAt: new Date().toISOString() as ISO8601DateString,
      };

      await storage.writeNote(updated);
      const read = await storage.readNote(note.id);

      expect(read).toEqual({
        ...updated,
        memoryVersion: 0,
        project: undefined,
        projectName: undefined,
        relatedTo: undefined,
      });
    });
  });

  describe("Metadata-only reads", () => {
    it("should return frontmatter metadata without a content field", async () => {
      const now = new Date().toISOString() as ISO8601DateString;
      const note: Note = {
        id: "meta-note-1" as MemoryId,
        title: "Meta Note",
        content: "This is the full body that metadata reads must skip.",
        tags: ["meta"],
        lifecycle: "permanent",
        role: "decision",
        project: "project-a",
        projectName: "Project A",
        relatedTo: [{ id: "related-1" as MemoryId, type: "related-to" }],
        createdAt: now,
        updatedAt: now,
      };

      await storage.writeNote(note);
      const read = await storage.readNoteMetadata(note.id);

      expect(read).not.toBeNull();
      expect(read!.id).toBe(note.id);
      expect(read!.title).toBe(note.title);
      expect(read!.tags).toEqual(note.tags);
      expect(read!.lifecycle).toBe(note.lifecycle);
      expect(read!.role).toBe(note.role);
      expect(read!.project).toBe(note.project);
      expect(read!.projectName).toBe(note.projectName);
      expect(read!.relatedTo).toEqual(note.relatedTo);
      expect(read!.createdAt).toBe(note.createdAt);
      expect(read!.updatedAt).toBe(note.updatedAt);
      // Metadata-only reads must not expose a content field at all.
      expect("content" in read!).toBe(false);
    });

    it("should return null for non-existent note", async () => {
      expect(await storage.readNoteMetadata("non-existent" as MemoryId)).toBeNull();
    });

    it("should return null for notes without frontmatter", async () => {
      const notesDir = path.join(tempDir, "notes");
      await fs.writeFile(path.join(notesDir, "malformed-meta.md"), "This has no frontmatter");

      expect(await storage.readNoteMetadata("malformed-meta" as MemoryId)).toBeNull();
    });

    it("should parse metadata correctly for notes with bodies larger than the read window", async () => {
      const now = new Date().toISOString() as ISO8601DateString;
      const largeBody = "x".repeat(100_000);
      const note: Note = {
        id: "large-body-note" as MemoryId,
        title: "Large Body Note",
        content: largeBody,
        tags: ["big"],
        lifecycle: "temporary",
        createdAt: now,
        updatedAt: now,
      };

      await storage.writeNote(note);

      // Instrument bytes read so the test can prove the metadata read skips the
      // 100KB body. `frontmatterReadBytes` is populated by the fs/promises mock
      // at the top of this file (wrapping each open() handle's read()).
      frontmatterReadBytes.total = 0;
      const read = await storage.readNoteMetadata(note.id);
      const metadataBytes = frontmatterReadBytes.total;
      expect(read).not.toBeNull();
      expect(read!.title).toBe("Large Body Note");
      expect(read!.tags).toEqual(["big"]);
      expect(read!.lifecycle).toBe("temporary");
      expect("content" in read!).toBe(false);

      // The metadata-only read must not consume the 100KB body: frontmatter
      // closes within the initial window, so only a small fraction is read.
      expect(metadataBytes).toBeGreaterThan(0);
      expect(metadataBytes).toBeLessThan(10_000);

      // A full read must still return the complete body (and read it).
      frontmatterReadBytes.total = 0;
      const full = await storage.readNote(note.id);
      expect(full!.content).toBe(largeBody);
      expect(frontmatterReadBytes.total).toBeGreaterThanOrEqual(largeBody.length);
    });

    it("should fall back to a full read when frontmatter exceeds the read window", async () => {
      const notesDir = path.join(tempDir, "notes");
      const longDescription = "d".repeat(20_000);
      const content = `---\ntitle: Long Frontmatter\ntags: ["edge"]\nlifecycle: permanent\ndescription: ${longDescription}\ncreatedAt: 2023-01-01T00:00:00.000Z\nupdatedAt: 2023-01-01T00:00:00.000Z\n---\n\nBody`;

      await fs.writeFile(path.join(notesDir, "long-frontmatter.md"), content, "utf-8");

      const read = await storage.readNoteMetadata("long-frontmatter" as MemoryId);
      expect(read).not.toBeNull();
      expect(read!.title).toBe("Long Frontmatter");
      expect(read!.tags).toEqual(["edge"]);
      expect("content" in read!).toBe(false);
    });

    it("should grow the read window incrementally and preserve non-ASCII frontmatter across the boundary", async () => {
      const notesDir = path.join(tempDir, "notes");
      // A multibyte-heavy title pushes the closing `---` well past the 1KB
      // initial window, forcing an incremental grow. If the grow logic or the
      // UTF-8 decode were wrong, the title would be truncated or corrupted.
      const title = "Mémory " + "🚀".repeat(300);
      const body = "Body " + "z".repeat(50_000);
      const content = `---\ntitle: ${title}\ntags: ["boundary", "ümlaut"]\nlifecycle: permanent\ncreatedAt: 2023-01-01T00:00:00.000Z\nupdatedAt: 2023-01-01T00:00:00.000Z\n---\n\n${body}`;

      await fs.writeFile(path.join(notesDir, "utf8-boundary.md"), content, "utf-8");

      const read = await storage.readNoteMetadata("utf8-boundary" as MemoryId);
      expect(read).not.toBeNull();
      expect(read!.title).toBe(title);
      expect(read!.tags).toEqual(["boundary", "ümlaut"]);
      expect("content" in read!).toBe(false);

      // Full read must still return the complete body.
      const full = await storage.readNote("utf8-boundary" as MemoryId);
      expect(full!.content).toBe(body);
    });

    it("should return metadata from a small frontmatter without reading a huge body", async () => {
      const notesDir = path.join(tempDir, "notes");
      // Frontmatter closes well within the initial window; body is far larger
      // than the metadata cap. The metadata read must not need the body at all.
      const body = "z".repeat(200_000);
      const content = `---\ntitle: Small Frontmatter\nlifecycle: permanent\ncreatedAt: 2023-01-01T00:00:00.000Z\nupdatedAt: 2023-01-01T00:00:00.000Z\n---\n\n${body}`;

      await fs.writeFile(path.join(notesDir, "small-frontmatter.md"), content, "utf-8");

      const read = await storage.readNoteMetadata("small-frontmatter" as MemoryId);
      expect(read).not.toBeNull();
      expect(read!.title).toBe("Small Frontmatter");
      expect("content" in read!).toBe(false);

      const full = await storage.readNote("small-frontmatter" as MemoryId);
      expect(full!.content).toBe(body);
    });

    it("should list metadata for all notes without filter", async () => {
      const now = new Date().toISOString() as ISO8601DateString;
      const notes: Note[] = [
        {
          id: "meta-list-1" as MemoryId,
          title: "Meta List 1",
          content: "Body 1",
          tags: [],
          lifecycle: "permanent",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "meta-list-2" as MemoryId,
          title: "Meta List 2",
          content: "Body 2",
          tags: [],
          lifecycle: "permanent",
          createdAt: now,
          updatedAt: now,
        },
      ];

      for (const note of notes) {
        await storage.writeNote(note);
      }

      const listed = await storage.listNotesMetadata();
      expect(listed).toHaveLength(2);
      expect(listed.map((n) => n.id).sort()).toEqual(["meta-list-1", "meta-list-2"]);
      for (const note of listed) {
        expect("content" in note).toBe(false);
      }
    });

    it("should filter metadata notes by project like listNotes", async () => {
      const now = new Date().toISOString() as ISO8601DateString;
      const notes: Note[] = [
        {
          id: "meta-proj-a" as MemoryId,
          title: "Proj A",
          content: "Body A",
          tags: [],
          lifecycle: "permanent",
          project: "project-a",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "meta-proj-b" as MemoryId,
          title: "Proj B",
          content: "Body B",
          tags: [],
          lifecycle: "permanent",
          project: "project-b",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "meta-global" as MemoryId,
          title: "Global",
          content: "Body G",
          tags: [],
          lifecycle: "permanent",
          createdAt: now,
          updatedAt: now,
        },
      ];

      for (const note of notes) {
        await storage.writeNote(note);
      }

      const projectA = await storage.listNotesMetadata({ project: "project-a" });
      const global = await storage.listNotesMetadata({ project: null });

      expect(projectA).toHaveLength(1);
      expect(projectA[0]!.id).toBe("meta-proj-a");
      expect("content" in projectA[0]!).toBe(false);

      expect(global).toHaveLength(1);
      expect(global[0]!.id).toBe("meta-global");
    });
  });

  describe("Embedding Operations", () => {
    it("should write and read embedding", async () => {
      const embedding: EmbeddingRecord = {
        id: "note-1" as MemoryId,
        model: "nomic-embed-text" as EmbeddingModelId,
        embedding: [0.1, 0.2, 0.3, 0.4],
        updatedAt: new Date().toISOString() as ISO8601DateString,
      };

      await storage.writeEmbedding(embedding);
      const read = await storage.readEmbedding(embedding.id);

      expect(read).toEqual(embedding);
    });

    it("should return null for missing embedding", async () => {
      const read = await storage.readEmbedding("non-existent" as MemoryId);
      expect(read).toBeNull();
    });

    it("should overwrite existing embedding", async () => {
      const id = "embedding-to-update" as MemoryId;
      const embedding1: EmbeddingRecord = {
        id,
        model: "nomic-embed-text" as EmbeddingModelId,
        embedding: [0.1, 0.2],
        updatedAt: "2023-01-01T00:00:00.000Z" as ISO8601DateString,
      };

      const embedding2: EmbeddingRecord = {
        id,
        model: "nomic-embed-text-v1.5" as EmbeddingModelId,
        embedding: [0.3, 0.4, 0.5],
        updatedAt: "2023-01-02T00:00:00.000Z" as ISO8601DateString,
      };

      await storage.writeEmbedding(embedding1);
      await storage.writeEmbedding(embedding2);

      const read = await storage.readEmbedding(id);
      expect(read).toEqual(embedding2);
    });
  });

  describe("Tag Filtering", () => {
    it("should handle notes with empty tags", async () => {
      const now = new Date().toISOString() as ISO8601DateString;
      const note: Note = {
        id: "no-tags" as MemoryId,
        title: "No Tags",
        content: "No tags here",
        tags: [],
        lifecycle: "permanent",
        createdAt: now,
        updatedAt: now,
      };

      await storage.writeNote(note);
      const read = await storage.readNote(note.id);

      expect(read!.tags).toEqual([]);
    });

    it("should handle notes with multiple tags", async () => {
      const now = new Date().toISOString() as ISO8601DateString;
      const note: Note = {
        id: "multi-tags" as MemoryId,
        title: "Multi Tags",
        content: "Many tags here",
        tags: ["tag1", "tag2", "tag3", "tag4"],
        lifecycle: "permanent",
        createdAt: now,
        updatedAt: now,
      };

      await storage.writeNote(note);
      const read = await storage.readNote(note.id);

      expect(read!.tags).toEqual(["tag1", "tag2", "tag3", "tag4"]);
    });
  });

  describe("RelatedTo Relationships", () => {
    it("should persist relationships", async () => {
      const now = new Date().toISOString() as ISO8601DateString;
      const note: Note = {
        id: "note-with-rels" as MemoryId,
        title: "Note with Relationships",
        content: "Has related notes",
        tags: [],
        lifecycle: "permanent",
        relatedTo: [
          { id: "rel-1" as MemoryId, type: "related-to" },
          { id: "rel-2" as MemoryId, type: "explains" },
          { id: "rel-3" as MemoryId, type: "example-of" },
          { id: "rel-4" as MemoryId, type: "supersedes" },
          { id: "rel-5" as MemoryId, type: "derives-from" },
          { id: "rel-6" as MemoryId, type: "follows" },
        ],
        createdAt: now,
        updatedAt: now,
      };

      await storage.writeNote(note);
      const read = await storage.readNote(note.id);

      expect(read!.relatedTo).toHaveLength(6);
      expect(read!.relatedTo).toEqual(note.relatedTo);
    });

    it("should handle notes without relationships", async () => {
      const now = new Date().toISOString() as ISO8601DateString;
      const note: Note = {
        id: "note-no-rels" as MemoryId,
        title: "No Relationships",
        content: "Standalone note",
        tags: [],
        lifecycle: "permanent",
        createdAt: now,
        updatedAt: now,
      };

      await storage.writeNote(note);
      const read = await storage.readNote(note.id);

      expect(read!.relatedTo).toBeUndefined();
    });
  });

  describe("Error Handling", () => {
    it("should handle missing notes directory gracefully", async () => {
      // Delete the notes directory
      await fs.rm(path.join(tempDir, "notes"), { recursive: true });

      // Should not throw when reading non-existent note
      const read = await storage.readNote("any" as MemoryId);
      expect(read).toBeNull();
    });

    it("should handle file system errors during write", async () => {
      const now = new Date().toISOString() as ISO8601DateString;
      const note: Note = {
        id: "test-note" as MemoryId,
        title: "Test",
        content: "Test content",
        tags: [],
        lifecycle: "permanent",
        createdAt: now,
        updatedAt: now,
      };

      // Make directory read-only to cause write failure
      await fs.chmod(path.join(tempDir, "notes"), 0o444);

      try {
        await storage.writeNote(note);
        // Should throw or fail
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeTruthy();
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(path.join(tempDir, "notes"), 0o755);
      }
    });
  });

  describe("JSON.parse validation at trust boundaries", () => {
    it("should return null for corrupted embedding JSON", async () => {
      const notesDir = path.join(tempDir, "notes");
      await fs.mkdir(notesDir, { recursive: true });
      const embeddingsDir = path.join(tempDir, "embeddings");
      await fs.mkdir(embeddingsDir, { recursive: true });

      await fs.writeFile(
        path.join(embeddingsDir, "corrupt-emb.json"),
        JSON.stringify({ id: 123, model: null, embedding: "not-an-array" }),
        "utf-8",
      );

      const read = await storage.readEmbedding("corrupt-emb" as MemoryId);
      expect(read).toBeNull();
    });

    it("should return null for corrupted projection JSON", async () => {
      const projectionsDir = path.join(tempDir, "projections");
      await fs.mkdir(projectionsDir, { recursive: true });

      await fs.writeFile(
        path.join(projectionsDir, "corrupt-proj.json"),
        JSON.stringify({ noteId: 42, title: true }),
        "utf-8",
      );

      const read = await storage.readProjection("corrupt-proj" as MemoryId);
      expect(read).toBeNull();
    });

    it("should gracefully handle malformed relatedTo in frontmatter", async () => {
      const notesDir = path.join(tempDir, "notes");
      const content = `---
title: Bad relatedTo
tags: []
lifecycle: permanent
relatedTo: "not-an-array"
createdAt: 2023-01-01T00:00:00.000Z
updatedAt: 2023-01-01T00:00:00.000Z
---

Body`;

      await fs.writeFile(path.join(notesDir, "bad-related-to.md"), content, "utf-8");

      const read = await storage.readNote("bad-related-to" as MemoryId);
      expect(read).toBeTruthy();
      expect(read!.relatedTo).toBeUndefined();
    });

    it("should filter out invalid relationship entries in relatedTo", async () => {
      const notesDir = path.join(tempDir, "notes");
      const content = `---
title: Mixed relatedTo
tags: []
lifecycle: permanent
relatedTo:
  - id: valid-rel
    type: related-to
  - id: invalid-rel
    type: invalid-type
  - not-an-object
createdAt: 2023-01-01T00:00:00.000Z
updatedAt: 2023-01-01T00:00:00.000Z
---

Body`;

      await fs.writeFile(path.join(notesDir, "mixed-related-to.md"), content, "utf-8");

      const read = await storage.readNote("mixed-related-to" as MemoryId);
      expect(read).toBeTruthy();
      expect(read!.relatedTo).toHaveLength(1);
      expect(read!.relatedTo![0]!.id).toBe("valid-rel");
      expect(read!.relatedTo![0]!.type).toBe("related-to");
    });

    it("should handle non-string project/projectName in frontmatter", async () => {
      const notesDir = path.join(tempDir, "notes");
      const content = `---
title: Bad project
tags: []
lifecycle: permanent
project: 42
projectName: true
createdAt: 2023-01-01T00:00:00.000Z
updatedAt: 2023-01-01T00:00:00.000Z
---

Body`;

      await fs.writeFile(path.join(notesDir, "bad-project.md"), content, "utf-8");

      const read = await storage.readNote("bad-project" as MemoryId);
      expect(read).toBeTruthy();
      expect(read!.project).toBeUndefined();
      expect(read!.projectName).toBeUndefined();
    });
  });
});

describe("Validation functions", () => {
  describe("validateRelatedTo", () => {
    it("should return undefined for null", () => {
      expect(validateRelatedTo(null)).toBeUndefined();
    });

    it("should return undefined for undefined", () => {
      expect(validateRelatedTo(undefined)).toBeUndefined();
    });

    it("should return undefined for non-array", () => {
      expect(validateRelatedTo("string")).toBeUndefined();
      expect(validateRelatedTo(42)).toBeUndefined();
      expect(validateRelatedTo({})).toBeUndefined();
    });

    it("should validate valid relationship entries", () => {
      const result = validateRelatedTo([
        { id: "rel-1" as MemoryId, type: "related-to" },
        { id: "rel-2" as MemoryId, type: "explains" },
      ]);
      expect(result).toEqual([
        { id: "rel-1" as MemoryId, type: "related-to" },
        { id: "rel-2" as MemoryId, type: "explains" },
      ]);
    });

    it("should filter out entries with invalid type", () => {
      const result = validateRelatedTo([
        { id: "valid" as MemoryId, type: "related-to" },
        { id: "invalid" as MemoryId, type: "not-a-type" },
      ]);
      expect(result).toEqual([{ id: "valid" as MemoryId, type: "related-to" }]);
    });

    it("should return undefined when all entries are invalid", () => {
      const result = validateRelatedTo([
        { id: "x" as MemoryId, type: "bad" },
        { not: "an object" },
      ]);
      expect(result).toBeUndefined();
    });

    it("should preserve vaultPath when present", () => {
      const result = validateRelatedTo([
        { id: "rel-1" as MemoryId, type: "related-to", vaultPath: "/path/to/vault" },
      ]);
      expect(result).toEqual([
        { id: "rel-1" as MemoryId, type: "related-to", vaultPath: "/path/to/vault" },
      ]);
    });

    it("should omit vaultPath when absent (no undefined in object)", () => {
      const result = validateRelatedTo([{ id: "rel-1" as MemoryId, type: "related-to" }]);
      expect(result).toEqual([{ id: "rel-1" as MemoryId, type: "related-to" }]);
      expect(result![0]).not.toHaveProperty("vaultPath");
    });
  });

  describe("validateEmbeddingRecord", () => {
    it("should validate a valid embedding record", () => {
      const result = validateEmbeddingRecord({
        id: "note-1" as MemoryId,
        model: "nomic-embed-text" as EmbeddingModelId,
        embedding: [0.1, 0.2],
        updatedAt: "2023-01-01T00:00:00.000Z" as ISO8601DateString,
      });
      expect(result).toEqual({
        id: "note-1" as MemoryId,
        model: "nomic-embed-text" as EmbeddingModelId,
        embedding: [0.1, 0.2],
        updatedAt: "2023-01-01T00:00:00.000Z" as ISO8601DateString,
      });
    });

    it("should return null for invalid embedding record", () => {
      expect(validateEmbeddingRecord({ id: 42 })).toBeNull();
      expect(validateEmbeddingRecord(null)).toBeNull();
      expect(
        validateEmbeddingRecord({
          id: "x" as MemoryId,
          model: "x",
          embedding: "bad",
          updatedAt: "x",
        }),
      ).toBeNull();
    });
  });

  describe("validateNoteProjection", () => {
    it("should validate a valid projection", () => {
      const proj = {
        noteId: "note-1",
        title: "Test",
        summary: "A summary",
        headings: ["H1"],
        tags: ["tag1"],
        projectionText: "full text",
        generatedAt: "2023-01-01T00:00:00.000Z",
      };
      const result = validateNoteProjection(proj);
      expect(result).toEqual(proj);
    });

    it("should validate a projection with optional fields", () => {
      const proj = {
        noteId: "note-1",
        title: "Test",
        summary: "A summary",
        headings: ["H1"],
        tags: ["tag1"],
        lifecycle: "permanent",
        updatedAt: "2023-01-02T00:00:00.000Z" as ISO8601DateString,
        projectionText: "full text",
        generatedAt: "2023-01-01T00:00:00.000Z",
      };
      const result = validateNoteProjection(proj);
      expect(result).toEqual(proj);
    });

    it("should return null for missing required fields", () => {
      expect(validateNoteProjection({ noteId: "x" })).toBeNull();
      expect(validateNoteProjection(null)).toBeNull();
    });
  });
});
