import { describe, it, expect } from "vitest";
import {
  withinThemeScore,
  anchorScore,
  computeConnectionDiversity,
  buildThemeCache,
  classifyTheme,
} from "../project-introspection.js";
import type { Note } from "../storage.js";

// Integration tests for project_memory_summary scoring logic.
// Full MCP-tool integration tests would require client infrastructure.
// Core scoring functions are tested in project-introspection.test.ts

describe("project_memory_summary scoring integration", () => {
  describe("within-theme ordering", () => {
    it("ranks recent notes higher than old notes with same connections", () => {
      const now = new Date().toISOString();
      const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const recentNote: Note = {
        id: "recent", title: "Recent", content: "", tags: [],
        lifecycle: "permanent", createdAt: now, updatedAt: now, memoryVersion: 1,
        relatedTo: [{ id: "other", type: "related-to" }],
      };
      
      const oldNote: Note = {
        id: "old", title: "Old", content: "", tags: [],
        lifecycle: "permanent", createdAt: old, updatedAt: old, memoryVersion: 1,
        relatedTo: [{ id: "other", type: "related-to" }],
      };
      
      expect(withinThemeScore(recentNote)).toBeGreaterThan(withinThemeScore(oldNote));
    });

    it("ranks notes with more connections higher (log-scaled)", () => {
      const now = new Date().toISOString();
      const connectedNote: Note = {
        id: "connected", title: "Connected", content: "", tags: [],
        lifecycle: "permanent", createdAt: now, updatedAt: now, memoryVersion: 1,
        relatedTo: [
          { id: "a", type: "related-to" },
          { id: "b", type: "related-to" },
          { id: "c", type: "related-to" },
        ],
      };
      
      const isolatedNote: Note = {
        id: "isolated", title: "Isolated", content: "", tags: [],
        lifecycle: "permanent", createdAt: now, updatedAt: now, memoryVersion: 1,
        relatedTo: [],
      };
      
      expect(withinThemeScore(connectedNote)).toBeGreaterThan(withinThemeScore(isolatedNote));
    });
  });

  describe("anchor selection", () => {
    it("rejects temporary notes", () => {
      const tempNote: Note = {
        id: "temp", title: "Temp", content: "", tags: [],
        lifecycle: "temporary", createdAt: "", updatedAt: "", memoryVersion: 1,
        relatedTo: [{ id: "other", type: "related-to" }],
      };
      
      const cache = new Map([["other", "decisions"]]);
      expect(anchorScore(tempNote, cache)).toBe(-Infinity);
    });

    it("scores permanent notes with connections", () => {
      const now = new Date().toISOString();
      const anchorNote: Note = {
        id: "anchor", title: "Anchor", content: "", tags: [],
        lifecycle: "permanent", createdAt: now, updatedAt: now, memoryVersion: 1,
        relatedTo: [
          { id: "a", type: "related-to" },
          { id: "b", type: "related-to" },
        ],
      };
      
      const cache = new Map([
        ["a", "decisions"],
        ["b", "architecture"],
      ]);
      
      expect(anchorScore(anchorNote, cache)).toBeGreaterThan(0);
    });

    it("scores diverse connections higher than single-theme connections", () => {
      const now = new Date().toISOString();
      const diverseNote: Note = {
        id: "diverse", title: "Diverse", content: "", tags: [],
        lifecycle: "permanent", createdAt: now, updatedAt: now, memoryVersion: 1,
        relatedTo: [
          { id: "a", type: "related-to" },
          { id: "b", type: "related-to" },
          { id: "c", type: "related-to" },
        ],
      };
      
      const narrowNote: Note = {
        id: "narrow", title: "Narrow", content: "", tags: [],
        lifecycle: "permanent", createdAt: now, updatedAt: now, memoryVersion: 1,
        relatedTo: [
          { id: "x", type: "related-to" },
          { id: "y", type: "related-to" },
          { id: "z", type: "related-to" },
        ],
      };
      
      const diverseCache = new Map([
        ["a", "decisions"],
        ["b", "architecture"],
        ["c", "tooling"],
      ]);
      
      const narrowCache = new Map([
        ["x", "decisions"],
        ["y", "decisions"],
        ["z", "decisions"],
      ]);
      
      const diverseScore = anchorScore(diverseNote, diverseCache);
      const narrowScore = anchorScore(narrowNote, narrowCache);
      
      expect(diverseScore).toBeGreaterThan(narrowScore);
    });
  });

  describe("connection diversity", () => {
    it("counts distinct themes of related notes", () => {
      const note: Note = {
        id: "test", title: "Test", content: "", tags: [],
        lifecycle: "permanent", createdAt: "", updatedAt: "", memoryVersion: 1,
        relatedTo: [
          { id: "a", type: "related-to" },
          { id: "b", type: "related-to" },
          { id: "c", type: "related-to" },
        ],
      };
      
      const cache = new Map([
        ["a", "decisions"],
        ["b", "architecture"],
        ["c", "decisions"],
      ]);
      
      expect(computeConnectionDiversity(note, cache)).toBe(2);
    });

    it("returns 0 for notes without relationships", () => {
      const note: Note = {
        id: "test", title: "Test", content: "", tags: [],
        lifecycle: "permanent", createdAt: "", updatedAt: "", memoryVersion: 1,
      };
      
      const cache = new Map();
      expect(computeConnectionDiversity(note, cache)).toBe(0);
    });

    it("returns 0 when related notes are missing from cache", () => {
      const note: Note = {
        id: "test", title: "Test", content: "", tags: [],
        lifecycle: "permanent", createdAt: "", updatedAt: "", memoryVersion: 1,
        relatedTo: [
          { id: "unknown", type: "related-to" },
        ],
      };
      
      const cache = new Map();
      expect(computeConnectionDiversity(note, cache)).toBe(0);
    });
  });

  describe("theme classification", () => {
    it("classifies overview by tag", () => {
      const note: Note = {
        id: "test", title: "Overview", content: "", tags: ["overview"],
        lifecycle: "permanent", createdAt: "", updatedAt: "", memoryVersion: 1,
      };
      expect(classifyTheme(note)).toBe("overview");
    });

    it("classifies decisions by tag", () => {
      const note: Note = {
        id: "test", title: "Some Decision", content: "", tags: ["decisions"],
        lifecycle: "permanent", createdAt: "", updatedAt: "", memoryVersion: 1,
      };
      expect(classifyTheme(note)).toBe("decisions");
    });

    it("classifies by title containing overview", () => {
      const note: Note = {
        id: "test", title: "Project Overview", content: "", tags: [],
        lifecycle: "permanent", createdAt: "", updatedAt: "", memoryVersion: 1,
      };
      expect(classifyTheme(note)).toBe("overview");
    });

    it("defaults to other for unknown tags", () => {
      const note: Note = {
        id: "test", title: "Random Note", content: "", tags: ["random-tag"],
        lifecycle: "permanent", createdAt: "", updatedAt: "", memoryVersion: 1,
      };
      expect(classifyTheme(note)).toBe("other");
    });
  });

  describe("buildThemeCache", () => {
    it("maps note ids to their themes", () => {
      const notes: Note[] = [
        { id: "a", title: "Overview", content: "", tags: ["overview"], lifecycle: "permanent", createdAt: "", updatedAt: "", memoryVersion: 1 },
        { id: "b", title: "Bug Fix", content: "", tags: ["bugs"], lifecycle: "permanent", createdAt: "", updatedAt: "", memoryVersion: 1 },
        { id: "c", title: "Tool Config", content: "", tags: ["tools"], lifecycle: "permanent", createdAt: "", updatedAt: "", memoryVersion: 1 },
      ];
      
      const cache = buildThemeCache(notes);
      expect(cache.get("a")).toBe("overview");
      expect(cache.get("b")).toBe("bugs");
      expect(cache.get("c")).toBe("tooling");
    });
  });
});