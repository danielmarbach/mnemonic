import { describe, expect, it } from "vitest";

import {
  classifyTheme,
  summarizePreview,
  titleCaseTheme,
  daysSinceUpdate,
  recencyScore,
  centralityBonus,
  withinThemeScore,
  anchorScore,
  buildThemeCache,
} from "../src/project-introspection.js";
import type { Note } from "../src/storage.js";

function makeNote(title: string, tags: string[]): Note {
  return {
    id: "note-1",
    title,
    content: "content",
    tags,
    lifecycle: "permanent",
    createdAt: "2026-03-07T00:00:00.000Z",
    updatedAt: "2026-03-07T00:00:00.000Z",
    memoryVersion: 1,
  };
}

describe("project introspection helpers", () => {
  it("classifies overview notes", () => {
    expect(classifyTheme(makeNote("mnemonic overview", ["architecture"]))).toBe("overview");
  });

  it("classifies policy notes as decisions", () => {
    expect(classifyTheme(makeNote("storage policy", ["policy", "ux"]))).toBe("decisions");
  });

  it("summarizes previews to a single trimmed line", () => {
    expect(summarizePreview("line one\n\nline two", 40)).toBe("line one line two");
  });

  it("title-cases theme labels", () => {
    expect(titleCaseTheme("tooling")).toBe("Tooling");
  });
});

describe("daysSinceUpdate", () => {
  it("returns 0 for now", () => {
    const now = new Date().toISOString();
    expect(daysSinceUpdate(now)).toBeCloseTo(0, 1);
  });

  it("returns correct days for past date", () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysSinceUpdate(sevenDaysAgo)).toBeCloseTo(7, 1);
  });
});

describe("recencyScore", () => {
  it("returns 1.0 for day 0", () => {
    expect(recencyScore(0)).toBe(1.0);
  });

  it("returns 0 for day 30+", () => {
    expect(recencyScore(30)).toBe(0);
    expect(recencyScore(100)).toBe(0);
  });

  it("decays linearly between 0 and 30", () => {
    expect(recencyScore(15)).toBeCloseTo(0.5, 2);
    expect(recencyScore(7)).toBeCloseTo(0.77, 1);
  });
});

describe("centralityBonus", () => {
  it("returns 0 for 0 connections", () => {
    expect(centralityBonus(0)).toBeCloseTo(0, 2);
  });

  it("uses log scaling", () => {
    expect(centralityBonus(3)).toBeCloseTo(Math.log(4) * 0.1, 3);
  });

  it("caps at 0.2", () => {
    expect(centralityBonus(100)).toBe(0.2);
    expect(centralityBonus(1000)).toBe(0.2);
  });
});

describe("withinThemeScore", () => {
  it("combines recency and centrality", () => {
    const note: Note = {
      id: "test-1",
      title: "Test",
      content: "Content",
      tags: [],
      lifecycle: "permanent",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      memoryVersion: 1,
      relatedTo: [{ id: "other-1", type: "related-to" }],
    };

    const score = withinThemeScore(note);
    expect(score).toBeGreaterThan(1.0);
    expect(score).toBeLessThan(1.3);
  });
});

describe("anchorScore", () => {
  it("returns -Infinity for temporary notes", () => {
    const note: Note = {
      id: "temp-1",
      title: "Temp",
      content: "Content",
      tags: [],
      lifecycle: "temporary",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      memoryVersion: 1,
    };

    const cache = new Map();
    expect(anchorScore(note, cache)).toBe(-Infinity);
  });

  it("scores permanent notes with connections", () => {
    const note: Note = {
      id: "anchor-1",
      title: "Anchor",
      content: "Content",
      tags: [],
      lifecycle: "permanent",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      memoryVersion: 1,
      relatedTo: [
        { id: "note-1", type: "related-to" },
        { id: "note-2", type: "related-to" },
      ],
    };

    const cache = new Map([
      ["note-1", "decisions"],
      ["note-2", "architecture"],
    ]);

    const score = anchorScore(note, cache);
    expect(score).toBeGreaterThan(0);
  });
});

describe("classifyTheme", () => {
  it("classifies overview notes", () => {
    const note: Note = {
      id: "test",
      title: "Project Overview",
      content: "",
      tags: ["overview"],
      lifecycle: "permanent",
      createdAt: "",
      updatedAt: "",
      memoryVersion: 1,
    };
    expect(classifyTheme(note)).toBe("overview");
  });

  it("classifies by tags", () => {
    const note: Note = {
      id: "test",
      title: "Some Decision",
      content: "",
      tags: ["decisions"],
      lifecycle: "permanent",
      createdAt: "",
      updatedAt: "",
      memoryVersion: 1,
    };
    expect(classifyTheme(note)).toBe("decisions");
  });

  it("defaults to other", () => {
    const note: Note = {
      id: "test",
      title: "Random Note",
      content: "",
      tags: [],
      lifecycle: "permanent",
      createdAt: "",
      updatedAt: "",
      memoryVersion: 1,
    };
    expect(classifyTheme(note)).toBe("other");
  });
});

describe("buildThemeCache", () => {
  it("maps note ids to themes", () => {
    const notes: Note[] = [
      { id: "a", title: "Overview", content: "", tags: ["overview"], lifecycle: "permanent", createdAt: "", updatedAt: "", memoryVersion: 1 },
      { id: "b", title: "Bug Fix", content: "", tags: ["bugs"], lifecycle: "permanent", createdAt: "", updatedAt: "", memoryVersion: 1 },
    ];

    const cache = buildThemeCache(notes);
    expect(cache.get("a")).toBe("overview");
    expect(cache.get("b")).toBe("bugs");
  });
});
