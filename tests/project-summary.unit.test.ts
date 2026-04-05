import { describe, expect, it } from "vitest";

import {
  anchorScore,
  buildThemeCache,
  classifyTheme,
  classifyThemeWithGraduation,
  computeConnectionDiversity,
  computeThemesWithGraduation,
  extractNextAction,
  withinThemeScore,
  workingStateScore,
} from "../src/project-introspection.js";
import type { Note } from "../src/storage.js";

const noMetadata = {
  roleSource: "none",
  importanceSource: "none",
  alwaysLoadSource: "none",
} as const;

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

    it("prefers summary notes over comparable context notes", () => {
      const note = makeNote({
        id: "scored-note",
        updatedAt: "2026-03-20T10:00:00.000Z",
        relatedTo: [{ id: "other", type: "related-to" }],
      });

      const summaryScore = withinThemeScore(note, {
        role: "summary",
        roleSource: "explicit",
        importanceSource: "none",
        alwaysLoadSource: "none",
      });
      const contextScore = withinThemeScore(note, {
        role: "context",
        roleSource: "explicit",
        importanceSource: "none",
        alwaysLoadSource: "none",
      });

      expect(summaryScore).toBeGreaterThan(contextScore);
    });

    it("gives suggested summary metadata a smaller within-theme boost", () => {
      const note = makeNote({
        id: "suggested-summary-note",
        updatedAt: "2026-03-20T10:00:00.000Z",
        relatedTo: [{ id: "other", type: "related-to" }],
      });

      expect(withinThemeScore(note, {
        role: "summary",
        roleSource: "suggested",
        importanceSource: "none",
        alwaysLoadSource: "none",
      })).toBeGreaterThan(withinThemeScore(note, noMetadata));
    });

    it("keeps explicit metadata stronger than suggested metadata within a theme", () => {
      const note = makeNote({
        id: "metadata-precedence-note",
        updatedAt: "2026-03-20T10:00:00.000Z",
        relatedTo: [{ id: "other", type: "related-to" }],
      });

      const explicitScore = withinThemeScore(note, {
        role: "summary",
        roleSource: "explicit",
        importance: "high",
        importanceSource: "explicit",
        alwaysLoadSource: "none",
      });

      const suggestedScore = withinThemeScore(note, {
        role: "summary",
        roleSource: "suggested",
        importance: "high",
        importanceSource: "suggested",
        alwaysLoadSource: "none",
      });

      expect(explicitScore).toBeGreaterThan(suggestedScore);
    });

    it("keeps metadata-free notes driven by graph and recency rather than wording", () => {
      const hub = makeNote({
        id: "metadata-free-hub",
        title: "Plain implementation note",
        content: "Ordinary content without special structure.",
        updatedAt: new Date().toISOString(),
        relatedTo: [
          { id: "a", type: "related-to" },
          { id: "b", type: "related-to" },
          { id: "c", type: "related-to" },
        ],
      });
      const wordyIsolated = makeNote({
        id: "wordy-isolated",
        title: "Summary decision overview architecture plan",
        content: "These are just words, not metadata.",
        updatedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        relatedTo: [],
      });

      expect(withinThemeScore(hub, noMetadata)).toBeGreaterThan(withinThemeScore(wordyIsolated, noMetadata));
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

    it("keeps temporary plan notes rejected even with metadata boosts", () => {
      const temporaryPlan = makeNote({
        id: "temporary-plan",
        lifecycle: "temporary",
        relatedTo: [
          { id: "a", type: "related-to" },
          { id: "b", type: "related-to" },
        ],
      });
      const themeCache = new Map([
        ["a", "overview"],
        ["b", "decisions"],
      ]);

      expect(anchorScore(temporaryPlan, themeCache, {
        role: "plan",
        roleSource: "explicit",
        importance: "high",
        importanceSource: "explicit",
        alwaysLoad: true,
        alwaysLoadSource: "explicit",
      })).toBe(-Infinity);
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

    it("boosts explicit alwaysLoad and importance metadata when scoring anchors", () => {
      const note = makeNote({
        id: "metadata-anchor",
        relatedTo: [{ id: "other", type: "related-to" }],
      });

      expect(anchorScore(note, new Map(), {
        ...noMetadata,
        importance: "high",
        alwaysLoad: true,
        importanceSource: "explicit",
        alwaysLoadSource: "explicit",
      })).toBeGreaterThan(anchorScore(note, new Map(), noMetadata));
    });

    it("gives suggested role and importance metadata a smaller anchor boost", () => {
      const note = makeNote({
        id: "suggested-anchor",
        relatedTo: [{ id: "other", type: "related-to" }],
      });

      expect(anchorScore(note, new Map(), {
        role: "summary",
        roleSource: "suggested",
        importance: "high",
        importanceSource: "suggested",
        alwaysLoadSource: "none",
      })).toBeGreaterThan(anchorScore(note, new Map(), noMetadata));
    });

    it("keeps explicit anchor metadata stronger than suggested metadata", () => {
      const note = makeNote({
        id: "explicit-beats-suggested-anchor",
        relatedTo: [{ id: "other", type: "related-to" }],
      });

      const explicitScore = anchorScore(note, new Map(), {
        role: "decision",
        roleSource: "explicit",
        importance: "high",
        importanceSource: "explicit",
        alwaysLoadSource: "none",
      });

      const suggestedScore = anchorScore(note, new Map(), {
        role: "decision",
        roleSource: "suggested",
        importance: "high",
        importanceSource: "suggested",
        alwaysLoadSource: "none",
      });

      expect(explicitScore).toBeGreaterThan(suggestedScore);
    });
  });

  describe("workingStateScore", () => {
    it("rejects permanent notes from working-state ranking", () => {
      const permanent = makeNote({
        id: "permanent-note",
        lifecycle: "permanent",
      });

      expect(workingStateScore(permanent)).toBe(-Infinity);
    });

    it("prefers recent structured temporary notes", () => {
      const recentWithNextStep = makeNote({
        id: "recent-next",
        lifecycle: "temporary",
        updatedAt: new Date().toISOString(),
        content: "## Status\n\nCurrent progress.\n\n- run the integration check",
      });
      const staleWithoutSignal = makeNote({
        id: "stale-note",
        lifecycle: "temporary",
        updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        content: "Old scratch note.",
      });

      expect(workingStateScore(recentWithNextStep)).toBeGreaterThan(workingStateScore(staleWithoutSignal));
    });

    it("keeps identical structure language-independent", () => {
      const sharedUpdatedAt = "2026-03-20T10:00:00.000Z";
      const english = makeNote({
        id: "english-structure",
        lifecycle: "temporary",
        updatedAt: sharedUpdatedAt,
        content: "## Status\n\nBlocked on one issue.\n\n- verify integration path\n- capture checkpoint",
      });
      const german = makeNote({
        id: "german-structure",
        lifecycle: "temporary",
        updatedAt: sharedUpdatedAt,
        content: "## Status\n\nBlockiert durch ein Problem.\n\n- Integrationspfad pruefen\n- Checkpoint erfassen",
      });

      expect(workingStateScore(english, noMetadata)).toBe(workingStateScore(german, noMetadata));
    });

    it("gives plan metadata a boost for temporary checkpoints", () => {
      const note = makeNote({
        id: "temporary-plan",
        lifecycle: "temporary",
        updatedAt: "2026-03-20T10:00:00.000Z",
      });

      expect(workingStateScore(note, {
        role: "plan",
        roleSource: "explicit",
        importanceSource: "none",
        alwaysLoadSource: "none",
      })).toBeGreaterThan(workingStateScore(note, noMetadata));
    });
  });

  describe("extractNextAction", () => {
    it("extracts explicit next action labels", () => {
      expect(extractNextAction({
        content: "Status update.\n\nNext action: verify the summary output.",
      })).toBe("verify the summary output.");
    });

    it("falls back to imperative action lines", () => {
      expect(extractNextAction({
        content: "Tried one approach.\n\nContinue with the project summary integration test.",
      })).toBe("Continue with the project summary integration test.");
    });

    it("can recover next actions from list structure without labels", () => {
      expect(extractNextAction({
        content: "## Status\n\nDone so far.\n\n- verify summary output\n- update the checkpoint",
      })).toBe("update the checkpoint");
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

  describe("computeThemesWithGraduation", () => {
    it("returns promoted themes sorted by frequency then alphabetically", () => {
      const notes = [
        makeNote({ id: "a", title: "PostgreSQL configuration", tags: [] }),
        makeNote({ id: "b", title: "PostgreSQL setup", tags: [] }),
        makeNote({ id: "c", title: "PostgreSQL tuning", tags: [] }),
        makeNote({ id: "d", title: "Redis cache settings", tags: [] }),
      ];

      const result = computeThemesWithGraduation(notes, { minKeywordFrequency: 2 });

      expect(result.promotedThemes).toContain("postgresql");
      expect(result.keywordFrequencies.get("postgresql")).toBe(3);
      expect(result.keywordFrequencies.get("redis")).toBe(1);
      expect(result.promotedThemes).not.toContain("redis");
    });

    it("assigns tag-based themes first, then falls back to keywords", () => {
      const notes = [
        makeNote({ id: "tagged", title: "Some note", tags: ["overview"] }),
        makeNote({ id: "keyword1", title: "PostgreSQL configuration", tags: [] }),
        makeNote({ id: "keyword2", title: "PostgreSQL tuning", tags: [] }),
        makeNote({ id: "fallback", title: "Misc entry", tags: [] }),
      ];

      const result = computeThemesWithGraduation(notes, { minKeywordFrequency: 2 });

      expect(result.themeAssignments.get("tagged")).toBe("overview");
      expect(result.themeAssignments.get("keyword1")).toBe("postgresql");
      expect(result.themeAssignments.get("keyword2")).toBe("postgresql");
      expect(result.themeAssignments.get("fallback")).toBe("other");
    });

    it("excludes generic terms from promotion", () => {
      const notes = [
        makeNote({ id: "a", title: "System note", tags: [] }),
        makeNote({ id: "b", title: "Another system note", tags: [] }),
        makeNote({ id: "c", title: "System config", tags: [] }),
      ];

      const result = computeThemesWithGraduation(notes, { minKeywordFrequency: 2 });

      expect(result.promotedThemes).not.toContain("system");
    });
  });

  describe("classifyThemeWithGraduation", () => {
    it("uses tag-based classification first", () => {
      const note = makeNote({ title: "Some title", tags: ["overview"] });
      expect(classifyThemeWithGraduation(note, new Set(["postgresql"]))).toBe("overview");
    });

    it("uses promoted keywords when no tag-based match", () => {
      const note = makeNote({ title: "PostgreSQL configuration", tags: [] });
      expect(classifyThemeWithGraduation(note, new Set(["postgresql"]))).toBe("postgresql");
    });

    it("returns other when no match", () => {
      const note = makeNote({ title: "Misc note", tags: [] });
      expect(classifyThemeWithGraduation(note, new Set(["postgresql"]))).toBe("other");
    });

    it("accepts promotedThemes as array or Set", () => {
      const note = makeNote({ title: "PostgreSQL note", tags: [] });
      expect(classifyThemeWithGraduation(note, ["postgresql"])).toBe("postgresql");
      expect(classifyThemeWithGraduation(note, new Set(["postgresql"]))).toBe("postgresql");
    });
  });
});
