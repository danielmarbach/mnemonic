import { describe, expect, it } from "vitest";
import type { Note } from "../src/storage.js";
import {
  buildProjection,
  buildProjectionText,
  extractHeadings,
  extractProjectionSummary,
  isProjectionStale,
} from "../src/projections.js";
import type { NoteProjection } from "../src/structured-content.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNote(overrides: Partial<Note> = {}): Note {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "test-note-abc123",
    title: "Test Note",
    content: "",
    tags: [],
    lifecycle: "permanent",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ── extractProjectionSummary ──────────────────────────────────────────────────

describe("extractProjectionSummary", () => {
  it("returns empty string for empty content", () => {
    const note = makeNote({ content: "" });
    expect(extractProjectionSummary(note)).toBe("");
  });

  it("extracts the first non-heading paragraph", () => {
    const note = makeNote({
      content: "## Background\n\nThis is the first paragraph. It contains the key decision.\n\nAnother paragraph here.",
    });
    const summary = extractProjectionSummary(note);
    expect(summary).toContain("This is the first paragraph");
    expect(summary).not.toContain("##");
  });

  it("skips leading headings and extracts first paragraph", () => {
    const note = makeNote({
      content: "# Top Heading\n\nThe actual summary content is here and should be extracted.",
    });
    const summary = extractProjectionSummary(note);
    expect(summary).toBe("The actual summary content is here and should be extracted.");
  });

  it("falls back to bullet list when no paragraph text is found", () => {
    const note = makeNote({
      content: "## Options\n\n- Option A\n- Option B\n- Option C",
    });
    const summary = extractProjectionSummary(note);
    expect(summary).toContain("Option A");
    expect(summary).toContain("Option B");
  });

  it("falls back to first 200 chars of plain text when no paragraph or list", () => {
    const note = makeNote({
      content: "## Heading\n\n### Sub\n\n#### Sub Sub",
    });
    // All are headings so falls back to first 200 chars of body after stripping leading heading
    const summary = extractProjectionSummary(note);
    expect(summary.length).toBeLessThanOrEqual(280);
  });

  it("truncates summary to 280 chars", () => {
    const longText = "A".repeat(400);
    const note = makeNote({ content: longText });
    const summary = extractProjectionSummary(note);
    expect(summary.length).toBeLessThanOrEqual(280);
  });

  it("collapses whitespace in summary", () => {
    const note = makeNote({
      content: "This   is   spaced   out   text.",
    });
    const summary = extractProjectionSummary(note);
    expect(summary).toBe("This is spaced out text.");
  });

  it("strips inline markdown from summary", () => {
    const note = makeNote({
      content: "This is **bold** and `code` and [a link](http://example.com).",
    });
    const summary = extractProjectionSummary(note);
    expect(summary).toBe("This is bold and code and a link.");
  });
});

// ── extractHeadings ───────────────────────────────────────────────────────────

describe("extractHeadings", () => {
  it("returns empty array for content with no headings", () => {
    expect(extractHeadings("Just some plain text.")).toEqual([]);
  });

  it("extracts h1, h2, h3 headings", () => {
    const md = "# Title\n\n## Section A\n\n### Sub\n\nsome text\n\n## Section B";
    expect(extractHeadings(md)).toEqual(["Title", "Section A", "Sub", "Section B"]);
  });

  it("does not include h4 and deeper headings", () => {
    const md = "# Top\n\n#### Deep";
    expect(extractHeadings(md)).toEqual(["Top"]);
  });

  it("deduplicates headings", () => {
    const md = "## Section\n\nsome text\n\n## Section";
    expect(extractHeadings(md)).toEqual(["Section"]);
  });

  it("respects max 8 headings limit", () => {
    const headings = Array.from({ length: 12 }, (_, i) => `## Heading ${i + 1}`).join("\n\n");
    const result = extractHeadings(headings);
    expect(result).toHaveLength(8);
  });

  it("preserves heading order", () => {
    const md = "## Z Section\n\n## A Section\n\n## M Section";
    expect(extractHeadings(md)).toEqual(["Z Section", "A Section", "M Section"]);
  });

  it("strips inline markdown from headings", () => {
    const md = "## **Bold** heading with `code`";
    expect(extractHeadings(md)).toEqual(["Bold heading with code"]);
  });
});

// ── buildProjectionText ───────────────────────────────────────────────────────

describe("buildProjectionText", () => {
  it("includes title, lifecycle, tags, summary, headings", () => {
    const text = buildProjectionText({
      title: "My Note",
      lifecycle: "permanent",
      tags: ["decision", "design"],
      summary: "A brief summary.",
      headings: ["Background", "Decision"],
    });
    expect(text).toContain("Title: My Note");
    expect(text).toContain("Lifecycle: permanent");
    expect(text).toContain("Tags: decision, design");
    expect(text).toContain("Summary: A brief summary.");
    expect(text).toContain("Headings: Background | Decision");
  });

  it("omits empty optional fields", () => {
    const text = buildProjectionText({
      title: "My Note",
      lifecycle: undefined,
      tags: [],
      summary: "",
      headings: [],
    });
    expect(text).toBe("Title: My Note");
  });

  it("keeps output within 1200 chars", () => {
    const longSummary = "S".repeat(500);
    const manyHeadings = Array.from({ length: 8 }, (_, i) => `Heading ${i + 1} ${"X".repeat(30)}`);
    const text = buildProjectionText({
      title: "My Note",
      lifecycle: "permanent",
      tags: ["tag1", "tag2"],
      summary: longSummary,
      headings: manyHeadings,
    });
    expect(text.length).toBeLessThanOrEqual(1200);
  });

  it("is deterministic for same inputs", () => {
    const args = {
      title: "Same Note",
      lifecycle: "temporary" as const,
      tags: ["a", "b"],
      summary: "Same summary",
      headings: ["H1", "H2"],
    };
    expect(buildProjectionText(args)).toBe(buildProjectionText(args));
  });
});

// ── buildProjection ───────────────────────────────────────────────────────────

describe("buildProjection", () => {
  it("produces a projection with correct noteId and title", () => {
    const note = makeNote({ id: "abc-123", title: "Design Decision" });
    const proj = buildProjection(note);
    expect(proj.noteId).toBe("abc-123");
    expect(proj.title).toBe("Design Decision");
  });

  it("includes tags and lifecycle from note", () => {
    const note = makeNote({ tags: ["design", "architecture"], lifecycle: "permanent" });
    const proj = buildProjection(note);
    expect(proj.tags).toEqual(["design", "architecture"]);
    expect(proj.lifecycle).toBe("permanent");
  });

  it("sets updatedAt from note.updatedAt", () => {
    const note = makeNote({ updatedAt: "2026-03-01T12:00:00.000Z" });
    const proj = buildProjection(note);
    expect(proj.updatedAt).toBe("2026-03-01T12:00:00.000Z");
  });

  it("sets generatedAt to a valid ISO timestamp", () => {
    const note = makeNote();
    const proj = buildProjection(note);
    expect(() => new Date(proj.generatedAt)).not.toThrow();
    expect(new Date(proj.generatedAt).toISOString()).toBe(proj.generatedAt);
  });

  it("projectionText is bounded at 1200 chars", () => {
    const note = makeNote({
      title: "T".repeat(100),
      content: "P".repeat(2000) + "\n\n## " + "H".repeat(100),
      tags: ["t1", "t2", "t3"],
    });
    const proj = buildProjection(note);
    expect(proj.projectionText.length).toBeLessThanOrEqual(1200);
  });

  it("is deterministic for the same note", () => {
    const note = makeNote({
      content: "This is consistent content.\n\n## A Heading",
    });
    const proj1 = buildProjection(note);
    const proj2 = buildProjection(note);
    // generatedAt will differ, but all derived fields should match
    expect(proj1.title).toBe(proj2.title);
    expect(proj1.summary).toBe(proj2.summary);
    expect(proj1.headings).toEqual(proj2.headings);
    expect(proj1.projectionText).toBe(proj2.projectionText);
  });
});

// ── isProjectionStale ─────────────────────────────────────────────────────────

describe("isProjectionStale", () => {
  const updatedAt = "2026-01-15T00:00:00.000Z";

  function makeProjection(overrides: Partial<NoteProjection> = {}): NoteProjection {
    return {
      noteId: "test-note-abc123",
      title: "Test Note",
      summary: "Summary",
      headings: [],
      tags: [],
      lifecycle: "permanent",
      updatedAt,
      projectionText: "Title: Test Note",
      generatedAt: "2026-01-15T01:00:00.000Z",
      ...overrides,
    };
  }

  it("returns false when updatedAt matches", () => {
    const note = makeNote({ updatedAt });
    const proj = makeProjection({ updatedAt });
    expect(isProjectionStale(note, proj)).toBe(false);
  });

  it("returns true when updatedAt is missing from projection", () => {
    const note = makeNote({ updatedAt });
    const proj = makeProjection({ updatedAt: undefined });
    expect(isProjectionStale(note, proj)).toBe(true);
  });

  it("returns true when updatedAt differs", () => {
    const note = makeNote({ updatedAt: "2026-02-01T00:00:00.000Z" });
    const proj = makeProjection({ updatedAt: "2026-01-01T00:00:00.000Z" });
    expect(isProjectionStale(note, proj)).toBe(true);
  });

  it("returns true when note was updated after projection was built", () => {
    const note = makeNote({ updatedAt: "2026-01-20T00:00:00.000Z" });
    const proj = makeProjection({ updatedAt: "2026-01-15T00:00:00.000Z" });
    expect(isProjectionStale(note, proj)).toBe(true);
  });
});

// ── Integration: buildProjection with realistic content ───────────────────────

describe("buildProjection integration", () => {
  it("handles a note with rich markdown content", () => {
    const note = makeNote({
      title: "Embedding Lazy Backfill",
      tags: ["embeddings", "design", "lazy"],
      lifecycle: "permanent",
      content: `
## Background

Embeddings are generated lazily on first use rather than eagerly on write.
This keeps the write path fast and avoids blocking on Ollama availability.

## Decision

Use \`updatedAt\` comparison to detect stale embeddings.

## Trade-offs

- **Pro:** Fast writes, no dependency on Ollama at write time
- **Con:** First recall may be slower if many embeddings are stale
      `.trim(),
    });

    const proj = buildProjection(note);

    expect(proj.title).toBe("Embedding Lazy Backfill");
    expect(proj.tags).toEqual(["embeddings", "design", "lazy"]);
    expect(proj.headings).toContain("Background");
    expect(proj.headings).toContain("Decision");
    expect(proj.headings).toContain("Trade-offs");
    expect(proj.summary).toBeTruthy();
    expect(proj.projectionText).toContain("Title: Embedding Lazy Backfill");
    expect(proj.projectionText).toContain("Tags: embeddings, design, lazy");
    expect(proj.projectionText.length).toBeLessThanOrEqual(1200);
  });

  it("handles a note with empty tags gracefully", () => {
    const note = makeNote({ tags: [], content: "Just some content." });
    const proj = buildProjection(note);
    expect(proj.tags).toEqual([]);
    expect(proj.projectionText).not.toContain("Tags:");
  });
});
