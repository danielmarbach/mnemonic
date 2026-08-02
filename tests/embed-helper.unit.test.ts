import { describe, it, expect, vi } from "vitest";
import { embedMissingNotes } from "../src/helpers/embed.js";
import type { NoteStorage, Note, NoteMetadata } from "../src/storage.js";
import type { ServerContext } from "../src/server-context.js";
import { memoryId } from "../src/brands.js";

// Mock the embedding call so the helper never hits a real model endpoint; keep
// the metadata/compatibility helpers real so records are shaped correctly.
vi.mock("../src/embeddings.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/embeddings.js")>();
  return { ...actual, embed: vi.fn(async () => [0.1, 0.2, 0.3]) };
});

// Projections are derived in embedTextForNote; mock them to avoid filesystem I/O.
vi.mock("../src/projections.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/projections.js")>();
  return {
    ...actual,
    getOrBuildProjection: vi.fn(async () => ({
      ok: true as const,
      value: { projectionText: "Mocked projection text" },
    })),
  };
});

function makeContext(concurrency: number): ServerContext {
  return { config: { reindexEmbedConcurrency: concurrency } } as unknown as ServerContext;
}

function makeNoteMetadata(id: string): NoteMetadata {
  return {
    id: memoryId(id),
    title: `Note ${id}`,
    tags: [],
    lifecycle: "permanent",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeFullNote(id: string): Note {
  return { ...makeNoteMetadata(id), content: `Body of ${id}` };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("embedMissingNotes", () => {
  it("hydrates stale notes inside the worker pool with bounded concurrency", async () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const concurrency = 3;

    let active = 0;
    let maxActive = 0;
    const written: string[] = [];

    const storage = {
      vaultPath: "/vault",
      readNote: async (id: string) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await delay(5);
        active--;
        return makeFullNote(id.replace(/^memory:/, ""));
      },
      writeEmbedding: async (record: { id: string }) => {
        written.push(record.id);
      },
    } as unknown as NoteStorage;

    const result = await embedMissingNotes(makeContext(concurrency), storage, undefined, false, {
      notes: ids.map((id) => makeNoteMetadata(id)),
      embeddings: [],
    });

    expect(result.rebuilt).toBe(ids.length);
    // Every note that needed (re)embedding is hydrated and written.
    expect(written).toHaveLength(ids.length);
    // The returned embeddings must include every rebuilt note so callers can
    // merge them into a cache snapshot.
    expect(result.embeddings.map((e) => e.id.replace(/^memory:/, ""))).toEqual(
      ids.sort().map((id) => id),
    );
    // Full-body reads are bounded by the worker count, never all at once.
    expect(maxActive).toBeGreaterThan(0);
    expect(maxActive).toBeLessThanOrEqual(concurrency);
  });

  it("does not re-embed notes whose embeddings are current", async () => {
    const now = "2026-01-01T00:00:00.000Z";
    const storage = {
      vaultPath: "/vault",
      readNote: async (id: string) => makeFullNote(id.replace(/^memory:/, "")),
      writeEmbedding: async () => {
        throw new Error("writeEmbedding should not be called for current notes");
      },
    } as unknown as NoteStorage;

    const result = await embedMissingNotes(makeContext(2), storage, undefined, false, {
      notes: [makeNoteMetadata("current")],
      // A compatible embedding that is newer than the note's updatedAt.
      embeddings: [
        {
          id: memoryId("current"),
          model: "test-model",
          embedding: [0.1, 0.2, 0.3],
          updatedAt: now,
        },
      ],
    });

    expect(result.rebuilt).toBe(0);
    expect(result.embeddings).toHaveLength(0);
  });
});
