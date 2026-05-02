import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Storage, type Note, type EmbeddingRecord } from "../src/storage.js";
import { validateRelatedTo, validateEmbeddingRecord, validateNoteProjection } from "../src/validation.js";
import * as fs from "fs/promises";
import * as path from "path";
import os from "os";

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
      const now = new Date().toISOString();
      const note: Note = {
        id: "test-note-1",
        title: "Test Note",
        content: "This is a test note.",
        tags: ["test", "unit"],
        lifecycle: "permanent",
        project: "test-project",
        projectName: "Test Project",
        relatedTo: [{ id: "related-1", type: "related-to" }],
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
        id: "old-note",
        title: "Old Note",
        content: "Legacy note without memoryVersion",
        tags: ["legacy"],
        project: "old-project",
        createdAt: "2023-01-01T00:00:00.000Z",
        updatedAt: "2023-01-01T00:00:00.000Z",
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

      const read = await storage.readNote("invalid-lifecycle");
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

      const read = await storage.readNote("metadata-note");

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

      const read = await storage.readNote("invalid-metadata-note");

      expect(read).toBeTruthy();
      expect(read?.role).toBeUndefined();
      expect(read?.importance).toBeUndefined();
      expect(read?.alwaysLoad).toBeUndefined();
    });

    it("should round-trip explicit metadata and only serialize explicitly present values", async () => {
      const now = new Date().toISOString();
      const note: Note = {
        id: "metadata-round-trip",
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
        id: "metadata-absent",
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
        "utf-8"
      );
      expect(rawWithoutMetadata).not.toContain("role:");
      expect(rawWithoutMetadata).not.toContain("importance:");
      expect(rawWithoutMetadata).not.toContain("alwaysLoad:");
    });

    it("should round-trip explicit alwaysLoad false metadata", async () => {
      const now = new Date().toISOString();
      const note: Note = {
        id: "metadata-alwaysload-false",
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
      const read = await storage.readNote("non-existent");
      expect(read).toBeNull();
    });

    it("should list all notes without filter", async () => {
      const now = new Date().toISOString();
      const notes: Note[] = [
        {
          id: "note-1",
          title: "Note 1",
          content: "Content 1",
          tags: [],
          lifecycle: "permanent",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "note-2",
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
      const now = new Date().toISOString();
      const notes: Note[] = [
        {
          id: "note-1",
          title: "Note 1",
          content: "Content 1",
          tags: [],
          lifecycle: "permanent",
          project: "project-a",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "note-2",
          title: "Note 2",
          content: "Content 2",
          tags: [],
          lifecycle: "permanent",
          project: "project-b",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "note-3",
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
      expect(projectA[0].id).toBe("note-1");

      expect(projectB).toHaveLength(1);
      expect(projectB[0].id).toBe("note-2");

      expect(global).toHaveLength(1);
      expect(global[0].id).toBe("note-3");
    });

    it("should handle malformed markdown gracefully", async () => {
      const notesDir = path.join(tempDir, "notes");

      // Create a malformed markdown file (no frontmatter)
      await fs.writeFile(path.join(notesDir, "malformed.md"), "This has no frontmatter");

      // Should not throw, just return null or skip
      const read = await storage.readNote("malformed");
      // The implementation returns null for notes without proper frontmatter
      expect(read).toBeNull();
    });

    it("should handle frontmatter parsing edge cases", async () => {
      const notesDir = path.join(tempDir, "notes");

      // Invalid YAML in frontmatter
      await fs.writeFile(
        path.join(notesDir, "invalid-yaml.md"),
        `---\ninvalid: yaml: here:::\n---\n\nContent`
      );

      const read = await storage.readNote("invalid-yaml");
      expect(read).toBeNull(); // Should handle gracefully
    });

    it("should delete a note", async () => {
      const now = new Date().toISOString();
      const note: Note = {
        id: "note-to-delete",
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
      const deleted = await storage.deleteNote("non-existent");
      expect(deleted).toBe(false);
    });

    it("should update an existing note", async () => {
      const now = new Date().toISOString();
      const note: Note = {
        id: "note-to-update",
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
        updatedAt: new Date().toISOString(),
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

  describe("Embedding Operations", () => {
    it("should write and read embedding", async () => {
      const embedding: EmbeddingRecord = {
        id: "note-1",
        model: "nomic-embed-text",
        embedding: [0.1, 0.2, 0.3, 0.4],
        updatedAt: new Date().toISOString(),
      };

      await storage.writeEmbedding(embedding);
      const read = await storage.readEmbedding(embedding.id);

      expect(read).toEqual(embedding);
    });

    it("should return null for missing embedding", async () => {
      const read = await storage.readEmbedding("non-existent");
      expect(read).toBeNull();
    });

    it("should overwrite existing embedding", async () => {
      const id = "embedding-to-update";
      const embedding1: EmbeddingRecord = {
        id,
        model: "nomic-embed-text",
        embedding: [0.1, 0.2],
        updatedAt: "2023-01-01T00:00:00.000Z",
      };

      const embedding2: EmbeddingRecord = {
        id,
        model: "nomic-embed-text-v1.5",
        embedding: [0.3, 0.4, 0.5],
        updatedAt: "2023-01-02T00:00:00.000Z",
      };

      await storage.writeEmbedding(embedding1);
      await storage.writeEmbedding(embedding2);

      const read = await storage.readEmbedding(id);
      expect(read).toEqual(embedding2);
    });
  });

  describe("Tag Filtering", () => {
    it("should handle notes with empty tags", async () => {
      const now = new Date().toISOString();
      const note: Note = {
        id: "no-tags",
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
      const now = new Date().toISOString();
      const note: Note = {
        id: "multi-tags",
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
      const now = new Date().toISOString();
      const note: Note = {
        id: "note-with-rels",
        title: "Note with Relationships",
        content: "Has related notes",
        tags: [],
        lifecycle: "permanent",
        relatedTo: [
          { id: "rel-1", type: "related-to" },
          { id: "rel-2", type: "explains" },
          { id: "rel-3", type: "example-of" },
          { id: "rel-4", type: "supersedes" },
          { id: "rel-5", type: "derives-from" },
          { id: "rel-6", type: "follows" },
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
      const now = new Date().toISOString();
      const note: Note = {
        id: "note-no-rels",
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
      const read = await storage.readNote("any");
      expect(read).toBeNull();
    });

    it("should handle file system errors during write", async () => {
      const now = new Date().toISOString();
      const note: Note = {
        id: "test-note",
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
        "utf-8"
      );

      const read = await storage.readEmbedding("corrupt-emb");
      expect(read).toBeNull();
    });

    it("should return null for corrupted projection JSON", async () => {
      const projectionsDir = path.join(tempDir, "projections");
      await fs.mkdir(projectionsDir, { recursive: true });

      await fs.writeFile(
        path.join(projectionsDir, "corrupt-proj.json"),
        JSON.stringify({ noteId: 42, title: true }),
        "utf-8"
      );

      const read = await storage.readProjection("corrupt-proj");
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

      const read = await storage.readNote("bad-related-to");
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

      const read = await storage.readNote("mixed-related-to");
      expect(read).toBeTruthy();
      expect(read!.relatedTo).toHaveLength(1);
      expect(read!.relatedTo![0].id).toBe("valid-rel");
      expect(read!.relatedTo![0].type).toBe("related-to");
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

      const read = await storage.readNote("bad-project");
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
        { id: "rel-1", type: "related-to" },
        { id: "rel-2", type: "explains" },
      ]);
      expect(result).toEqual([
        { id: "rel-1", type: "related-to" },
        { id: "rel-2", type: "explains" },
      ]);
    });

    it("should filter out entries with invalid type", () => {
      const result = validateRelatedTo([
        { id: "valid", type: "related-to" },
        { id: "invalid", type: "not-a-type" },
      ]);
      expect(result).toEqual([{ id: "valid", type: "related-to" }]);
    });

    it("should return undefined when all entries are invalid", () => {
      const result = validateRelatedTo([
        { id: "x", type: "bad" },
        { not: "an object" },
      ]);
      expect(result).toBeUndefined();
    });
  });

  describe("validateEmbeddingRecord", () => {
    it("should validate a valid embedding record", () => {
      const result = validateEmbeddingRecord({
        id: "note-1",
        model: "nomic-embed-text",
        embedding: [0.1, 0.2],
        updatedAt: "2023-01-01T00:00:00.000Z",
      });
      expect(result).toEqual({
        id: "note-1",
        model: "nomic-embed-text",
        embedding: [0.1, 0.2],
        updatedAt: "2023-01-01T00:00:00.000Z",
      });
    });

    it("should return null for invalid embedding record", () => {
      expect(validateEmbeddingRecord({ id: 42 })).toBeNull();
      expect(validateEmbeddingRecord(null)).toBeNull();
      expect(validateEmbeddingRecord({ id: "x", model: "x", embedding: "bad", updatedAt: "x" })).toBeNull();
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
        updatedAt: "2023-01-02T00:00:00.000Z",
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
