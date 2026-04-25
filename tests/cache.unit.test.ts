import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Note, EmbeddingRecord } from "../src/storage.js";
import type { NoteProjection } from "../src/structured-content.js";
import type { Vault } from "../src/vault.js";

import {
  invalidateActiveProjectCache,
  getActiveProjectCache,
  getOrBuildVaultNoteList,
  getOrBuildVaultEmbeddings,
  getSessionCachedNote,
  getSessionCachedProjection,
  getSessionCachedProjectionTokens,
  setSessionCachedProjection,
  setSessionCachedProjectionTokens,
} from "../src/cache.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

const NOW = "2026-01-01T00:00:00.000Z";

function makeNote(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    title: `Note ${id}`,
    content: `Content for ${id}`,
    tags: [],
    lifecycle: "permanent",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeEmbedding(id: string): EmbeddingRecord {
  return { id, model: "nomic-embed-text", embedding: [0.1, 0.2, 0.3], updatedAt: NOW };
}

function makeProjection(noteId: string): NoteProjection {
  return {
    noteId,
    title: `Note ${noteId}`,
    summary: "Summary",
    headings: [],
    tags: [],
    lifecycle: "permanent",
    updatedAt: NOW,
    projectionText: `Title: Note ${noteId}`,
    generatedAt: NOW,
  };
}

function makeVault(vaultPath: string, notes: Note[], embeddings: EmbeddingRecord[]): Vault {
  return {
    storage: {
      vaultPath,
      listNotes: vi.fn().mockResolvedValue(notes),
      listEmbeddings: vi.fn().mockResolvedValue(embeddings),
      readNote: vi.fn(),
      writeNote: vi.fn(),
      deleteNote: vi.fn(),
      readEmbedding: vi.fn(),
      writeEmbedding: vi.fn(),
      readProjection: vi.fn(),
      writeProjection: vi.fn(),
      notesDir: `${vaultPath}/notes`,
      embeddingsDir: `${vaultPath}/embeddings`,
      projectionsDir: `${vaultPath}/projections`,
      init: vi.fn(),
    } as unknown as Vault["storage"],
    git: {} as Vault["git"],
    isProject: false,
    notesRelDir: ".mnemonic/notes",
  } as unknown as Vault;
}

// ── Reset between tests ───────────────────────────────────────────────────────

beforeEach(() => {
  // Clear any active cache left over from previous tests
  invalidateActiveProjectCache();
});

// ── A. Cache lifecycle ─────────────────────────────────────────────────────────

describe("cache lifecycle", () => {
  it("has no cache before first access", () => {
    expect(getActiveProjectCache("test-project")).toBeUndefined();
  });

  it("builds vault note list on first access (cache miss)", async () => {
    const notes = [makeNote("note-1"), makeNote("note-2")];
    const vault = makeVault("/vault/project", notes, []);

    const result = await getOrBuildVaultNoteList("test-project", vault);

    expect(result).toEqual(notes);
    expect(vault.storage.listNotes).toHaveBeenCalledOnce();
  });

  it("reuses cached note list on subsequent access (cache hit)", async () => {
    const notes = [makeNote("note-1")];
    const vault = makeVault("/vault/project", notes, []);

    await getOrBuildVaultNoteList("test-project", vault);
    const second = await getOrBuildVaultNoteList("test-project", vault);

    expect(second).toEqual(notes);
    // listNotes should only be called once — second call hits cache
    expect(vault.storage.listNotes).toHaveBeenCalledOnce();
  });

  it("builds vault embeddings on first access (cache miss)", async () => {
    const embeddings = [makeEmbedding("note-1"), makeEmbedding("note-2")];
    const vault = makeVault("/vault/project", [], embeddings);

    const result = await getOrBuildVaultEmbeddings("test-project", vault);

    expect(result).toEqual(embeddings);
    expect(vault.storage.listEmbeddings).toHaveBeenCalledOnce();
  });

  it("reuses cached embeddings on subsequent access (cache hit)", async () => {
    const embeddings = [makeEmbedding("note-1")];
    const vault = makeVault("/vault/project", [], embeddings);

    await getOrBuildVaultEmbeddings("test-project", vault);
    const second = await getOrBuildVaultEmbeddings("test-project", vault);

    expect(second).toEqual(embeddings);
    expect(vault.storage.listEmbeddings).toHaveBeenCalledOnce();
  });

  it("shares vault data between note list and embeddings calls", async () => {
    const notes = [makeNote("note-1")];
    const embeddings = [makeEmbedding("note-1")];
    const vault = makeVault("/vault/project", notes, embeddings);

    // First call via notes — builds the vault cache (loads both notes AND embeddings)
    await getOrBuildVaultNoteList("test-project", vault);
    // Second call via embeddings — should hit the same vault cache
    const cachedEmbeddings = await getOrBuildVaultEmbeddings("test-project", vault);

    expect(cachedEmbeddings).toEqual(embeddings);
    // Only one call to each because both were loaded in a single build
    expect(vault.storage.listNotes).toHaveBeenCalledOnce();
    expect(vault.storage.listEmbeddings).toHaveBeenCalledOnce();
  });

  it("reports cache presence after first build", async () => {
    const vault = makeVault("/vault/project", [], []);

    await getOrBuildVaultNoteList("test-project", vault);

    expect(getActiveProjectCache("test-project")).toBeDefined();
  });

  it("returns undefined from getActiveProjectCache for a different project", async () => {
    const vault = makeVault("/vault/project", [], []);

    await getOrBuildVaultNoteList("project-A", vault);

    expect(getActiveProjectCache("project-B")).toBeUndefined();
  });
});

// ── B. Invalidation ────────────────────────────────────────────────────────────

describe("invalidation", () => {
  it("clears cache on invalidation", async () => {
    const vault = makeVault("/vault/project", [makeNote("note-1")], []);
    await getOrBuildVaultNoteList("test-project", vault);

    expect(getActiveProjectCache("test-project")).toBeDefined();

    invalidateActiveProjectCache();

    expect(getActiveProjectCache("test-project")).toBeUndefined();
  });

  it("is safe to call when no cache exists (no-op)", () => {
    expect(() => invalidateActiveProjectCache()).not.toThrow();
  });

  it("forces a rebuild on next access after invalidation", async () => {
    const vault = makeVault("/vault/project", [makeNote("note-1")], []);

    await getOrBuildVaultNoteList("test-project", vault);
    invalidateActiveProjectCache();
    await getOrBuildVaultNoteList("test-project", vault);

    // Called twice: once before invalidation, once after rebuild
    expect(vault.storage.listNotes).toHaveBeenCalledTimes(2);
  });

  it("creates a fresh cache when project switches", async () => {
    const vaultA = makeVault("/vault/A", [makeNote("note-a")], []);
    const vaultB = makeVault("/vault/B", [makeNote("note-b")], []);

    await getOrBuildVaultNoteList("project-A", vaultA);
    // Accessing project-B should silently discard project-A cache and start fresh
    await getOrBuildVaultNoteList("project-B", vaultB);

    expect(getActiveProjectCache("project-A")).toBeUndefined();
    expect(getActiveProjectCache("project-B")).toBeDefined();
  });
});

// ── C. Individual note lookup ──────────────────────────────────────────────────

describe("getSessionCachedNote", () => {
  it("returns note after vault cache is built", async () => {
    const note = makeNote("note-1");
    const vault = makeVault("/vault/project", [note], []);

    await getOrBuildVaultNoteList("test-project", vault);

    const found = getSessionCachedNote("test-project", "/vault/project", "note-1");
    expect(found).toEqual(note);
  });

  it("returns undefined for an id not in the vault", async () => {
    const vault = makeVault("/vault/project", [makeNote("note-1")], []);
    await getOrBuildVaultNoteList("test-project", vault);

    expect(getSessionCachedNote("test-project", "/vault/project", "missing")).toBeUndefined();
  });

  it("returns undefined when no cache exists", () => {
    expect(getSessionCachedNote("test-project", "/vault/project", "note-1")).toBeUndefined();
  });

  it("returns undefined for a different project", async () => {
    const note = makeNote("note-1");
    const vault = makeVault("/vault/project", [note], []);
    await getOrBuildVaultNoteList("project-A", vault);

    expect(getSessionCachedNote("project-B", "/vault/project", "note-1")).toBeUndefined();
  });
});

// ── D. Projection cache ────────────────────────────────────────────────────────

describe("projection cache", () => {
  it("stores and retrieves a projection", async () => {
    const vault = makeVault("/vault/project", [], []);
    // Ensure cache exists for the project
    await getOrBuildVaultNoteList("test-project", vault);

    const projection = makeProjection("note-1");
    setSessionCachedProjection("test-project", "note-1", projection);

    expect(getSessionCachedProjection("test-project", "note-1")).toEqual(projection);
  });

  it("returns undefined for unknown projection", async () => {
    const vault = makeVault("/vault/project", [], []);
    await getOrBuildVaultNoteList("test-project", vault);

    expect(getSessionCachedProjection("test-project", "missing")).toBeUndefined();
  });

  it("projection is cleared on invalidation", async () => {
    const vault = makeVault("/vault/project", [], []);
    await getOrBuildVaultNoteList("test-project", vault);

    setSessionCachedProjection("test-project", "note-1", makeProjection("note-1"));
    invalidateActiveProjectCache();

    expect(getSessionCachedProjection("test-project", "note-1")).toBeUndefined();
  });

  it("setSessionCachedProjection is a no-op when no cache exists", () => {
    expect(() => setSessionCachedProjection("test-project", "note-1", makeProjection("note-1"))).not.toThrow();
  });

  it("stores and retrieves projection tokens when projection text matches", async () => {
    const vault = makeVault("/vault/project", [], []);
    await getOrBuildVaultNoteList("test-project", vault);

    const projectionText = "Title: Note note-1\nSummary: hybrid recall design";
    setSessionCachedProjectionTokens("test-project", "/vault/project", "note-1", projectionText, [
      "title",
      "note",
      "hybrid",
      "recall",
      "design",
    ]);

    expect(
      getSessionCachedProjectionTokens("test-project", "/vault/project", "note-1", projectionText)
    ).toEqual(["title", "note", "hybrid", "recall", "design"]);
  });

  it("returns undefined projection tokens when projection text has changed", async () => {
    const vault = makeVault("/vault/project", [], []);
    await getOrBuildVaultNoteList("test-project", vault);

    const originalText = "Title: Note note-1\nSummary: original";
    setSessionCachedProjectionTokens("test-project", "/vault/project", "note-1", originalText, [
      "title",
      "original",
    ]);

    expect(
      getSessionCachedProjectionTokens(
        "test-project",
        "/vault/project",
        "note-1",
        "Title: Note note-1\nSummary: updated"
      )
    ).toBeUndefined();
  });

  it("projection token cache is cleared on invalidation", async () => {
    const vault = makeVault("/vault/project", [], []);
    await getOrBuildVaultNoteList("test-project", vault);

    const projectionText = "Title: Note note-1";
    setSessionCachedProjectionTokens("test-project", "/vault/project", "note-1", projectionText, [
      "title",
      "note",
    ]);

    invalidateActiveProjectCache();

    expect(
      getSessionCachedProjectionTokens("test-project", "/vault/project", "note-1", projectionText)
    ).toBeUndefined();
  });

  it("setSessionCachedProjectionTokens is a no-op when no cache exists", () => {
    expect(() =>
      setSessionCachedProjectionTokens(
        "test-project",
        "/vault/project",
        "note-1",
        "Title: Note note-1",
        ["title", "note"]
      )
    ).not.toThrow();
  });
});

// ── E. Failure handling ────────────────────────────────────────────────────────

describe("failure handling", () => {
  it("returns undefined when storage.listNotes throws", async () => {
    const vault = makeVault("/vault/project", [], []);
    vi.mocked(vault.storage.listNotes).mockRejectedValueOnce(new Error("disk error"));

    const result = await getOrBuildVaultNoteList("test-project", vault);

    expect(result).toBeUndefined();
  });

  it("returns undefined when storage.listEmbeddings throws", async () => {
    const vault = makeVault("/vault/project", [], []);
    vi.mocked(vault.storage.listEmbeddings).mockRejectedValueOnce(new Error("io error"));

    const result = await getOrBuildVaultEmbeddings("test-project", vault);

    expect(result).toBeUndefined();
  });

  it("does not corrupt cache state after a failed build", async () => {
    const notes = [makeNote("note-1")];
    const vault = makeVault("/vault/project", notes, []);
    vi.mocked(vault.storage.listNotes).mockRejectedValueOnce(new Error("first call fails"));

    // First call fails
    const failed = await getOrBuildVaultNoteList("test-project", vault);
    expect(failed).toBeUndefined();

    // Second call should succeed (storage back to healthy)
    const ok = await getOrBuildVaultNoteList("test-project", vault);
    expect(ok).toEqual(notes);
  });
});

// ── F. Measurement coverage ────────────────────────────────────────────────────

describe("measurement / instrumentation", () => {
  it("emits cache:miss log on first build", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const vault = makeVault("/vault/project", [], []);

    await getOrBuildVaultNoteList("test-project", vault);

    const logs = spy.mock.calls.map((args) => args[0] as string);
    expect(logs.some((l) => l.includes("[cache:miss]"))).toBe(true);
    spy.mockRestore();
  });

  it("emits cache:build log with timing on first build", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const vault = makeVault("/vault/project", [], []);

    await getOrBuildVaultNoteList("test-project", vault);

    const logs = spy.mock.calls.map((args) => args[0] as string);
    expect(logs.some((l) => l.includes("[cache:build]") && l.includes("time="))).toBe(true);
    spy.mockRestore();
  });

  it("emits cache:hit log on warm access", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const vault = makeVault("/vault/project", [], []);

    await getOrBuildVaultNoteList("test-project", vault);
    spy.mockClear();
    await getOrBuildVaultNoteList("test-project", vault);

    const logs = spy.mock.calls.map((args) => args[0] as string);
    expect(logs.some((l) => l.includes("[cache:hit]"))).toBe(true);
    spy.mockRestore();
  });

  it("emits cache:invalidate log on invalidation", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const vault = makeVault("/vault/project", [], []);

    await getOrBuildVaultNoteList("test-project", vault);
    spy.mockClear();
    invalidateActiveProjectCache();

    const logs = spy.mock.calls.map((args) => args[0] as string);
    expect(logs.some((l) => l.includes("[cache:invalidate]"))).toBe(true);
    spy.mockRestore();
  });

  it("emits cache:fallback log on storage error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const vault = makeVault("/vault/project", [], []);
    vi.mocked(vault.storage.listNotes).mockRejectedValueOnce(new Error("io error"));

    await getOrBuildVaultNoteList("test-project", vault);

    const logs = spy.mock.calls.map((args) => args[0] as string);
    expect(logs.some((l) => l.includes("[cache:fallback]"))).toBe(true);
    spy.mockRestore();
  });

  it("instrumentation does not affect returned data", async () => {
    const notes = [makeNote("note-1"), makeNote("note-2")];
    const embeddings = [makeEmbedding("note-1")];
    const vault = makeVault("/vault/project", notes, embeddings);

    // Suppress debug output — should not change results
    vi.spyOn(console, "error").mockImplementation(() => {});

    const noteList = await getOrBuildVaultNoteList("test-project", vault);
    const embList = await getOrBuildVaultEmbeddings("test-project", vault);

    expect(noteList).toEqual(notes);
    expect(embList).toEqual(embeddings);

    vi.restoreAllMocks();
  });
});
