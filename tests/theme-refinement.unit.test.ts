import { describe, expect, it } from "vitest";
import {
  computeThemesWithGraduation,
  extractKeywords,
  normalizeKeyword,
} from "../src/project-introspection.js";
import type { Note } from "../src/storage.js";
import { isoDateString, memoryId } from "../src/brands.js";

/** Fixture overrides: id/createdAt/updatedAt are branded in Note but plain strings in tests. */
type NoteOverrides = Partial<Omit<Note, "id" | "createdAt" | "updatedAt">> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};

describe("extractKeywords", () => {
  it("extracts keywords from title and tags", () => {
    const note = {
      id: memoryId("test"),
      title: "JWT authentication bug fix",
      content: "",
      tags: ["auth", "security"],
      lifecycle: "permanent" as const,
      createdAt: isoDateString(""),
      updatedAt: isoDateString(""),
      memoryVersion: 1,
    };
    const keywords = extractKeywords(note);
    expect(keywords).toContain("jwt");
    // "auth" tag is normalized to "authentication" by the synonym dictionary
    expect(keywords).toContain("authentication");
    expect(keywords).toContain("security");
  });

  it("filters stopwords", () => {
    const note = {
      id: memoryId("test"),
      title: "The system for note data",
      content: "",
      tags: [],
      lifecycle: "permanent" as const,
      createdAt: isoDateString(""),
      updatedAt: isoDateString(""),
      memoryVersion: 1,
    };
    const keywords = extractKeywords(note);
    expect(keywords).not.toContain("the");
    expect(keywords).not.toContain("for");
    expect(keywords).toContain("system");
  });

  it("extracts from content summary when available", () => {
    const note = {
      id: memoryId("test"),
      title: "Decision",
      content: "We decided to use PostgreSQL for persistence because of ACID requirements.",
      tags: [],
      lifecycle: "permanent" as const,
      createdAt: isoDateString(""),
      updatedAt: isoDateString(""),
      memoryVersion: 1,
    };
    const keywords = extractKeywords(note);
    expect(keywords).toContain("postgresql");
    expect(keywords).toContain("persistence");
    expect(keywords).toContain("acid");
  });
});

describe("normalizeKeyword", () => {
  it("normalizes synonyms to canonical form", () => {
    expect(normalizeKeyword("postgres")).toBe("postgresql");
    expect(normalizeKeyword("pg")).toBe("postgresql");
    expect(normalizeKeyword("auth")).toBe("authentication");
    expect(normalizeKeyword("authn")).toBe("authentication");
    expect(normalizeKeyword("jwt")).toBe("jwt"); // stays same
  });
});

describe("computeThemesWithGraduation", () => {
  function makeNote(overrides: NoteOverrides): Note {
    return {
      id: memoryId(overrides.id ?? "test"),
      title: overrides.title ?? "Test note",
      content: overrides.content ?? "",
      tags: overrides.tags ?? [],
      lifecycle: overrides.lifecycle ?? "permanent",
      createdAt: isoDateString(overrides.createdAt ?? ""),
      updatedAt: isoDateString(overrides.updatedAt ?? ""),
      memoryVersion: overrides.memoryVersion ?? 1,
    };
  }

  it("graduates keywords that appear across multiple notes", () => {
    const notes: Note[] = [
      makeNote({ id: "a", title: "PostgreSQL connection pool" }),
      makeNote({ id: "b", title: "PostgreSQL query optimization" }),
      makeNote({ id: "c", title: "PostgreSQL index strategy" }),
      makeNote({ id: "d", title: "Random note" }),
    ];

    const result = computeThemesWithGraduation(notes);
    expect(result.promotedThemes).toContain("postgresql");
    expect(result.themeAssignments.get("a")).toBe("postgresql");
    expect(result.themeAssignments.get("d")).toBe("other");
  });

  it("does not graduate keywords below threshold", () => {
    const notes: Note[] = [
      makeNote({ id: "a", title: "Unique topic alpha" }),
      makeNote({ id: "b", title: "Random" }),
    ];

    const result = computeThemesWithGraduation(notes, { minKeywordFrequency: 3 });
    expect(result.promotedThemes).toHaveLength(0);
  });

  it("rejects generic terms from graduation", () => {
    const notes: Note[] = [
      makeNote({ id: "a", title: "System configuration" }),
      makeNote({ id: "b", title: "System setup" }),
      makeNote({ id: "c", title: "System notes" }),
    ];

    const result = computeThemesWithGraduation(notes);
    expect(result.promotedThemes).not.toContain("system");
  });
});
