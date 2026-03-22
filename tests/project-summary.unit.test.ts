import { describe, expect, it } from "vitest";

import {
  anchorScore,
  buildThemeCache,
  classifyTheme,
  computeConnectionDiversity,
  withinThemeScore,
} from "../src/project-introspection.js";
import type { Note } from "../src/storage.js";

function makeNote(overrides: Partial<Note> = {}): Note {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? "note",
    title: overrides.title ?? "Note",
    content: overrides.content ?? "",
    tags: overrides.tags ?? [],
    lifecycle: overrides.lifecycle ?? "permanent",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    memoryVersion: overrides.memoryVersion ?? 1,
    relatedTo: overrides.relatedTo,
    project: overrides.project,
    projectName: overrides.projectName,
  };
}

describe("project summary scoring helpers", () => {
  describe("withinThemeScore", () => {
    it("prefers a more recent note when connectivity is the same", () => {
      const recent = makeNote({
        id: "recent",
        updatedAt: new Date().toISOString(),
        relatedTo: [{ id: "other", type: "related-to" }],
      });
      const stale = makeNote({
        id: "stale",
        updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        relatedTo: [{ id: "other", type: "related-to" }],
      });

      expect(withinThemeScore(recent)).toBeGreaterThan(withinThemeScore(stale));
    });

    it("prefers a more connected note when recency is the same", () => {
      const now = new Date().toISOString();
      const hub = makeNote({
        id: "hub",
        updatedAt: now,
        relatedTo: [
          { id: "a", type: "related-to" },
          { id: "b", type: "related-to" },
          { id: "c", type: "related-to" },
        ],
      });
      const isolated = makeNote({ id: "isolated", updatedAt: now, relatedTo: [] });

      expect(withinThemeScore(hub)).toBeGreaterThan(withinThemeScore(isolated));
    });
  });

  describe("anchorScore", () => {
    it("rejects temporary notes even when they are highly connected", () => {
      const temporaryHub = makeNote({
        id: "temporary-hub",
        lifecycle: "temporary",
        relatedTo: [
          { id: "a", type: "related-to" },
          { id: "b", type: "related-to" },
          { id: "c", type: "related-to" },
        ],
      });
      const themeCache = new Map([
        ["a", "overview"],
        ["b", "decisions"],
        ["c", "architecture"],
      ]);

      expect(anchorScore(temporaryHub, themeCache)).toBe(-Infinity);
    });

    it("prefers notes that connect multiple themes over same-count single-theme hubs", () => {
      const diverseHub = makeNote({
        id: "diverse-hub",
        relatedTo: [
          { id: "a", type: "related-to" },
          { id: "b", type: "related-to" },
          { id: "c", type: "related-to" },
        ],
      });
      const narrowHub = makeNote({
        id: "narrow-hub",
        relatedTo: [
          { id: "x", type: "related-to" },
          { id: "y", type: "related-to" },
          { id: "z", type: "related-to" },
        ],
      });

      const diverseCache = new Map([
        ["a", "overview"],
        ["b", "decisions"],
        ["c", "architecture"],
      ]);
      const narrowCache = new Map([
        ["x", "decisions"],
        ["y", "decisions"],
        ["z", "decisions"],
      ]);

      expect(anchorScore(diverseHub, diverseCache)).toBeGreaterThan(anchorScore(narrowHub, narrowCache));
    });

    it("gives some score to permanent tagged notes even without relationships", () => {
      const taggedAnchor = makeNote({
        id: "tagged-anchor",
        tags: ["anchor"],
        relatedTo: [],
      });

      expect(anchorScore(taggedAnchor, new Map())).toBeGreaterThan(0);
    });
  });

  describe("computeConnectionDiversity", () => {
    it("counts unique themes, not raw relationship count", () => {
      const note = makeNote({
        id: "diversity-check",
        relatedTo: [
          { id: "a", type: "related-to" },
          { id: "b", type: "related-to" },
          { id: "c", type: "related-to" },
          { id: "d", type: "related-to" },
        ],
      });

      const themeCache = new Map([
        ["a", "overview"],
        ["b", "architecture"],
        ["c", "overview"],
        ["d", "architecture"],
      ]);

      expect(computeConnectionDiversity(note, themeCache)).toBe(2);
    });

    it("ignores related ids missing from the cache", () => {
      const note = makeNote({
        id: "partial-cache",
        relatedTo: [
          { id: "known", type: "related-to" },
          { id: "unknown", type: "related-to" },
        ],
      });

      expect(computeConnectionDiversity(note, new Map([["known", "tooling"]]))).toBe(1);
    });
  });

  describe("classifyTheme and buildThemeCache", () => {
    it("classifies important synonyms into the expected buckets", () => {
      expect(classifyTheme(makeNote({ title: "Project Overview" }))).toBe("overview");
      expect(classifyTheme(makeNote({ tags: ["policy"] }))).toBe("decisions");
      expect(classifyTheme(makeNote({ tags: ["docker"] }))).toBe("tooling");
      expect(classifyTheme(makeNote({ tags: ["setup"] }))).toBe("bugs");
      expect(classifyTheme(makeNote({ tags: ["relationships"] }))).toBe("architecture");
      expect(classifyTheme(makeNote({ tags: ["tests"] }))).toBe("quality");
      expect(classifyTheme(makeNote({ tags: ["misc"] }))).toBe("other");
    });

    it("builds a theme cache that can drive diversity scoring", () => {
      const cache = buildThemeCache([
        makeNote({ id: "overview-note", title: "Overview", tags: ["overview"] }),
        makeNote({ id: "decision-note", title: "Decision", tags: ["design"] }),
        makeNote({ id: "tool-note", title: "Tool", tags: ["mcp"] }),
      ]);

      expect(cache).toEqual(new Map([
        ["overview-note", "overview"],
        ["decision-note", "decisions"],
        ["tool-note", "tooling"],
      ]));
    });
  });
});
