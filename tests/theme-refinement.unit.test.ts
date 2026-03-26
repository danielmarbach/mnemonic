import { describe, expect, it } from "vitest";
import { extractKeywords, normalizeKeyword } from "../src/project-introspection.js";

describe("extractKeywords", () => {
  it("extracts keywords from title and tags", () => {
    const note = {
      id: "test",
      title: "JWT authentication bug fix",
      content: "",
      tags: ["auth", "security"],
      lifecycle: "permanent" as const,
      createdAt: "",
      updatedAt: "",
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
      id: "test",
      title: "The system for note data",
      content: "",
      tags: [],
      lifecycle: "permanent" as const,
      createdAt: "",
      updatedAt: "",
      memoryVersion: 1,
    };
    const keywords = extractKeywords(note);
    expect(keywords).not.toContain("the");
    expect(keywords).not.toContain("for");
    expect(keywords).toContain("system");
  });

  it("extracts from content summary when available", () => {
    const note = {
      id: "test",
      title: "Decision",
      content: "We decided to use PostgreSQL for persistence because of ACID requirements.",
      tags: [],
      lifecycle: "permanent" as const,
      createdAt: "",
      updatedAt: "",
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