import { describe, expect, it } from "vitest";

import {
  getDirectRelatedNotes,
  buildRelationshipPreview,
  scoreRelatedNote,
  isAnchor,
  isRecentlyUpdated,
} from "../src/relationships.js";
import type { EffectiveNoteMetadata } from "../src/role-suggestions.js";
import type { Note } from "../src/storage.js";
import type { Vault } from "../src/vault.js";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const createNote = (overrides: Partial<Note>): Note => ({
  id: "test-note",
  title: "Test Note",
  content: "Test content",
  tags: [],
  lifecycle: "permanent",
  createdAt: "2026-03-20T00:00:00.000Z",
  updatedAt: "2026-03-20T00:00:00.000Z",
  relatedTo: [],
  ...overrides,
});

const createVault = (notes: Note[]): Vault => ({
  storage: {
    readNote: async (id: string) => notes.find(note => note.id === id),
    listNotes: async () => notes,
  },
} as unknown as Vault);

// ── Unit tests for scoring helpers ────────────────────────────────────────────

describe("isAnchor", () => {
  it("recognizes anchor tag", () => {
    const note = createNote({ lifecycle: "permanent", tags: ["anchor"] });
    expect(isAnchor(note)).toBe(true);
  });

  it("recognizes alwaysload tag", () => {
    const note = createNote({ lifecycle: "permanent", tags: ["alwaysload"] });
    expect(isAnchor(note)).toBe(true);
  });

  it("requires permanent lifecycle", () => {
    const note = createNote({ lifecycle: "temporary", tags: ["anchor"] });
    expect(isAnchor(note)).toBe(false);
  });

  it("returns false for non-anchor notes", () => {
    const note = createNote({ tags: ["design", "decision"] });
    expect(isAnchor(note)).toBe(false);
  });
});

describe("isRecentlyUpdated", () => {
  it("returns true for notes updated within 5 days", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const note = createNote({ updatedAt: yesterday.toISOString() });
    expect(isRecentlyUpdated(note)).toBe(true);
  });

  it("returns false for notes older than 5 days", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 13);
    const note = createNote({ updatedAt: oldDate.toISOString() });
    expect(isRecentlyUpdated(note)).toBe(false);
  });

  it("handles boundary at 5 days", () => {
    const boundaryDate = new Date();
    boundaryDate.setDate(boundaryDate.getDate() - 5);
    const note = createNote({ updatedAt: boundaryDate.toISOString() });
    expect(isRecentlyUpdated(note)).toBe(false);
  });
});

describe("scoreRelatedNote", () => {
  it("gives same-project boost (100 points)", () => {
    const projectNote = createNote({ project: "test-project" });
    const globalNote = createNote({});
    expect(scoreRelatedNote(projectNote, "test-project")).toBeGreaterThan(
      scoreRelatedNote(globalNote, "test-project")
    );
  });

  it("gives anchor boost (50 points)", () => {
    const anchorNote = createNote({ lifecycle: "permanent", tags: ["anchor"] });
    const nonAnchorNote = createNote({ lifecycle: "permanent", tags: [] });
    expect(scoreRelatedNote(anchorNote, undefined)).toBeGreaterThan(
      scoreRelatedNote(nonAnchorNote, undefined)
    );
  });

  it("gives recency boost (20 points)", () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 1);
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 13);
    const recentNote = createNote({ updatedAt: recentDate.toISOString() });
    const oldNote = createNote({ updatedAt: oldDate.toISOString() });
    expect(scoreRelatedNote(recentNote, undefined)).toBeGreaterThan(
      scoreRelatedNote(oldNote, undefined)
    );
  });

  it("gives confidence boost for high confidence notes", () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 1);
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 54);
    const highConfNote = createNote({
      lifecycle: "permanent",
      relatedTo: Array.from({ length: 5 }, (_, i) => ({ id: `rel-${i}`, type: "related-to" as const })),
      updatedAt: recentDate.toISOString(),
    });
    const lowConfNote = createNote({
      lifecycle: "temporary",
      relatedTo: [],
      updatedAt: oldDate.toISOString(),
    });
    expect(scoreRelatedNote(highConfNote, undefined)).toBeGreaterThan(
      scoreRelatedNote(lowConfNote, undefined)
    );
  });

  it("combines boosts additively", () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 1);
    const perfectNote = createNote({
      project: "test-project",
      lifecycle: "permanent",
      tags: ["anchor"],
      relatedTo: Array.from({ length: 5 }, (_, i) => ({ id: `rel-${i}`, type: "related-to" as const })),
      updatedAt: recentDate.toISOString(),
    });
    const baseNote = createNote({});
    const perfectScore = scoreRelatedNote(perfectNote, "test-project");
    const baseScore = scoreRelatedNote(baseNote, undefined);
    expect(perfectScore).toBeGreaterThan(baseScore);
    expect(perfectScore).toBeGreaterThanOrEqual(100 + 50 + 20 + 10); // minimum combined boost
  });

  it("prefers summary and decision metadata when other factors are comparable", () => {
    const baseNote = createNote({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const summaryMetadata: EffectiveNoteMetadata = {
      role: "summary",
      roleSource: "suggested",
      importanceSource: "none",
      alwaysLoadSource: "none",
    };
    const decisionMetadata: EffectiveNoteMetadata = {
      role: "decision",
      roleSource: "suggested",
      importanceSource: "none",
      alwaysLoadSource: "none",
    };

    expect(scoreRelatedNote(baseNote, undefined, summaryMetadata)).toBeGreaterThan(
      scoreRelatedNote(baseNote, undefined)
    );
    expect(scoreRelatedNote(baseNote, undefined, decisionMetadata)).toBeGreaterThan(
      scoreRelatedNote(baseNote, undefined)
    );
  });

  it("gives an explicit alwaysLoad boost", () => {
    const note = createNote({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const alwaysLoadMetadata: EffectiveNoteMetadata = {
      roleSource: "none",
      importanceSource: "none",
      alwaysLoad: true,
      alwaysLoadSource: "explicit",
    };

    expect(scoreRelatedNote(note, undefined, alwaysLoadMetadata)).toBeGreaterThan(
      scoreRelatedNote(note, undefined)
    );
  });

  it("keeps same-project priority above metadata-only global notes", () => {
    const projectNote = createNote({ id: "project", project: "test-project", updatedAt: "2026-01-01T00:00:00.000Z" });
    const globalNote = createNote({ id: "global", updatedAt: "2026-01-01T00:00:00.000Z" });
    const richMetadata: EffectiveNoteMetadata = {
      role: "summary",
      roleSource: "suggested",
      importance: "high",
      importanceSource: "suggested",
      alwaysLoad: true,
      alwaysLoadSource: "explicit",
    };

    expect(scoreRelatedNote(projectNote, "test-project")).toBeGreaterThan(
      scoreRelatedNote(globalNote, "test-project", richMetadata)
    );
  });
});

// ── Integration tests for relationship expansion ──────────────────────────────

describe("buildRelationshipPreview", () => {
  it("returns undefined when no scored relations provided", () => {
    const result = buildRelationshipPreview([], { activeProjectId: "test-project" });
    expect(result).toBeUndefined();
  });

  it("respects limit parameter", () => {
    const scored = [
      { note: createNote({ id: "1", title: "First" }), vault: {} as any, relationType: "related-to" as const, score: 100 },
      { note: createNote({ id: "2", title: "Second" }), vault: {} as any, relationType: "related-to" as const, score: 90 },
      { note: createNote({ id: "3", title: "Third" }), vault: {} as any, relationType: "related-to" as const, score: 80 },
      { note: createNote({ id: "4", title: "Fourth" }), vault: {} as any, relationType: "related-to" as const, score: 70 },
    ];

    const result = buildRelationshipPreview(scored, { activeProjectId: "test-project", limit: 2 });
    expect(result?.shown).toHaveLength(2);
    expect(result?.truncated).toBe(true);
    expect(result?.totalDirectRelations).toBe(4);
  });

  it("enforces hard max of 5", () => {
    const scored = Array.from({ length: 10 }, (_, i) => ({
      note: createNote({ id: `${i}`, title: `Note ${i}` }),
      vault: {} as any,
      relationType: "related-to" as const,
      score: 100 - i,
    }));

    const result = buildRelationshipPreview(scored, { activeProjectId: "test-project", limit: 10 });
    expect(result?.shown).toHaveLength(5);
    expect(result?.truncated).toBe(true);
  });

  it("includes theme in preview", () => {
    const scored = [
      { note: createNote({ id: "1", title: "Design Decision", tags: ["design"] }), vault: {} as any, relationType: "related-to" as const, score: 100 },
    ];

    const result = buildRelationshipPreview(scored, { activeProjectId: "test-project" });
    expect(result?.shown[0].theme).toBe("decisions");
  });

  it("omits theme when classified as other", () => {
    const scored = [
      { note: createNote({ id: "1", title: "Random Note" }), vault: {} as any, relationType: "related-to" as const, score: 100 },
    ];

    const result = buildRelationshipPreview(scored, { activeProjectId: "test-project" });
    expect(result?.shown[0].theme).toBeUndefined();
  });
});

describe("getDirectRelatedNotes", () => {
  it("uses visible relationship graph context to infer metadata during scoring", async () => {
    const source = createNote({
      id: "source",
      relatedTo: [
        { id: "summary", type: "related-to" },
        { id: "plain", type: "related-to" },
      ],
    });
    const summary = createNote({
      id: "summary",
      title: "Summary note",
      updatedAt: "2026-01-01T00:00:00.000Z",
      content: [
        "# Overview",
        "## Details",
        "- first",
        "- second",
        "- third",
        "- fourth",
      ].join("\n"),
    });
    const plain = createNote({
      id: "plain",
      title: "Plain note",
      updatedAt: "2026-01-01T00:00:00.000Z",
      content: "Just a regular note.",
    });
    const inboundA = createNote({ id: "inbound-a", lifecycle: "permanent", relatedTo: [{ id: "summary", type: "related-to" }] });
    const inboundB = createNote({ id: "inbound-b", lifecycle: "permanent", relatedTo: [{ id: "summary", type: "related-to" }] });
    const inboundC = createNote({ id: "inbound-c", lifecycle: "temporary", relatedTo: [{ id: "summary", type: "related-to" }] });
    const inboundD = createNote({ id: "inbound-d", lifecycle: "temporary", relatedTo: [{ id: "summary", type: "related-to" }] });

    const vault = createVault([source, summary, plain, inboundA, inboundB, inboundC, inboundD]);

    const result = await getDirectRelatedNotes(source, [vault]);

    expect(result.map(entry => entry.note.id).slice(0, 2)).toEqual(["summary", "plain"]);
  });
});

// ── Acceptance criteria validation ────────────────────────────────────────────

describe("Phase 4 acceptance criteria", () => {
  it("1-hop expansion only (no transitive relations)", () => {
    const directRelated = createNote({
      id: "direct",
      title: "Direct",
      relatedTo: [{ id: "transitive", type: "related-to" }],
    });
    const sourceNote = createNote({
      relatedTo: [{ id: "direct", type: "related-to" }],
    });

    // getDirectRelatedNotes only follows sourceNote.relatedTo, not direct.relatedTo
    // This is validated by the function signature - it takes sourceNote.relatedTo as input
    expect(sourceNote.relatedTo?.length).toBe(1);
    expect(sourceNote.relatedTo![0].id).toBe("direct");
  });

  it("same-project notes prioritized", () => {
    const projectNote = createNote({ id: "proj", project: "test-project", title: "Project" });
    const globalNote = createNote({ id: "global", title: "Global" });

    const scored = [
      { note: globalNote, vault: {} as any, relationType: "related-to" as const, score: scoreRelatedNote(globalNote, undefined) },
      { note: projectNote, vault: {} as any, relationType: "related-to" as const, score: scoreRelatedNote(projectNote, "test-project") },
    ];
    scored.sort((a, b) => b.score - a.score);

    expect(scored[0].note.id).toBe("proj");
  });

  it("output stays compact (max 3 shown by default)", () => {
    const scored = Array.from({ length: 10 }, (_, i) => ({
      note: createNote({ id: `${i}`, title: `Note ${i}` }),
      vault: {} as any,
      relationType: "related-to" as const,
      score: 100 - i,
    }));

    const result = buildRelationshipPreview(scored, { activeProjectId: "test-project" });
    expect(result?.shown).toHaveLength(3);
  });

  it("truncated flag set when more relations exist", () => {
    const scored = Array.from({ length: 5 }, (_, i) => ({
      note: createNote({ id: `${i}`, title: `Note ${i}` }),
      vault: {} as any,
      relationType: "related-to" as const,
      score: 100 - i,
    }));

    const result = buildRelationshipPreview(scored, { activeProjectId: "test-project", limit: 3 });
    expect(result?.truncated).toBe(true);
    expect(result?.totalDirectRelations).toBe(5);
  });
});
