import { describe, expect, it } from "vitest";

import { applySemanticPatches, type SemanticPatch } from "../src/semantic-patch.js";

describe("semantic-patch", () => {
  const sampleNote =
    "# My Note\n\n" +
    "This is the introduction.\n\n" +
    "## Details\n\n" +
    "Some detailed content here.\n\n" +
    "## Related\n\n" +
    "- Item one\n" +
    "- Item two\n";

  it("appends content after a heading using appendChild on paragraph", async () => {
    const note = "# Note\n\n## Details\n\nSome content.\n";
    const patches: SemanticPatch[] = [
      {
        selector: { heading: "Details" },
        operation: { op: "insertAfter", value: "Appended after Details." },
      },
    ];
    const result = await applySemanticPatches(note, patches);
    expect(result.content).toContain("Appended after Details.");
    expect(result.lintWarnings).toEqual([]);
  });

  it("replaces a paragraph's content using replaceChildren", async () => {
    const note = "# Note\n\nSome content here.\n";
    const patches: SemanticPatch[] = [
      {
        selector: { nthChild: 1 },
        operation: { op: "replaceChildren", value: "Completely replaced content." },
      },
    ];
    const result = await applySemanticPatches(note, patches);
    expect(result.content).toContain("Completely replaced content.");
    expect(result.content).not.toContain("Some content here.");
    expect(result.lintWarnings).toEqual([]);
  });

  it("throws a diagnostic error when heading is not found", async () => {
    const patches: SemanticPatch[] = [
      {
        selector: { heading: "NonExistent" },
        operation: { op: "appendChild", value: "This won't work." },
      },
    ];
    await expect(applySemanticPatches(sampleNote, patches)).rejects.toThrow(
      "Available headings"
    );
  });

  it("lists available headings in diagnostic when heading not found", async () => {
    const patches: SemanticPatch[] = [
      {
        selector: { heading: "Missing" },
        operation: { op: "appendChild", value: "Won't work." },
      },
    ];
    await expect(applySemanticPatches(sampleNote, patches)).rejects.toThrow("My Note");
    await expect(applySemanticPatches(sampleNote, patches)).rejects.toThrow("Details");
    await expect(applySemanticPatches(sampleNote, patches)).rejects.toThrow("Related");
  });

  it("removes a heading node", async () => {
    const patches: SemanticPatch[] = [
      {
        selector: { heading: "Related" },
        operation: { op: "remove" },
      },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    expect(result.content).not.toContain("Related");
    expect(result.lintWarnings).toEqual([]);
  });

  it("inserts content after a heading", async () => {
    const patches: SemanticPatch[] = [
      {
        selector: { heading: "My Note" },
        operation: { op: "insertAfter", value: "Paragraph inserted after the title." },
      },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    expect(result.content).toContain("Paragraph inserted after the title.");
    expect(result.lintWarnings).toEqual([]);
  });

  it("matches heading by prefix with headingStartsWith and inserts after", async () => {
    const patches: SemanticPatch[] = [
      {
        selector: { headingStartsWith: "Det" },
        operation: { op: "insertAfter", value: "Appended via prefix match." },
      },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    expect(result.content).toContain("Appended via prefix match.");
    expect(result.lintWarnings).toEqual([]);
  });

  it("selects by nthChild", async () => {
    const note = "# A\n\nfirst\n\n## B\n\nsecond\n";
    const patches: SemanticPatch[] = [
      {
        selector: { nthChild: 2 },
        operation: { op: "replace", value: "replaced" },
      },
    ];
    const result = await applySemanticPatches(note, patches);
    expect(result.content).toContain("replaced");
    expect(result.lintWarnings).toEqual([]);
  });

  it("selects by lastChild", async () => {
    const patches: SemanticPatch[] = [
      {
        selector: { lastChild: true },
        operation: { op: "replace", value: "replaced" },
      },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    expect(result.content).toContain("replaced");
    expect(result.content).not.toContain("Item two");
    expect(result.lintWarnings).toEqual([]);
  });

  it("prepends content under a heading", async () => {
    const patches: SemanticPatch[] = [
      {
        selector: { heading: "Details" },
        operation: { op: "prependChild", value: "Prepended content." },
      },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    const detailsIndex = result.content.indexOf("## Details");
    const prependIndex = result.content.indexOf("Prepended content.");
    const oldIndex = result.content.indexOf("Some detailed content here.");
    expect(prependIndex).toBeGreaterThan(detailsIndex);
    expect(oldIndex).toBeGreaterThan(prependIndex);
    expect(result.lintWarnings).toEqual([]);
  });

  it("inserts content before a heading", async () => {
    const patches: SemanticPatch[] = [
      {
        selector: { heading: "Details" },
        operation: { op: "insertBefore", value: "Inserted before Details." },
      },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    expect(result.content.indexOf("Inserted before Details.")).toBeLessThan(
      result.content.indexOf("## Details")
    );
    expect(result.lintWarnings).toEqual([]);
  });

  // ── Multi-scenario tests ──────────────────────────────────────────────

  it("applies multiple patches in a single call", async () => {
    const patches: SemanticPatch[] = [
      { selector: { heading: "My Note" }, operation: { op: "insertAfter", value: "After title." } },
      { selector: { heading: "Details" }, operation: { op: "insertAfter", value: "After Details." } },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    expect(result.content.indexOf("After title.")).toBeLessThan(result.content.indexOf("## Details"));
    // insertAfter on a heading inserts as a sibling after the heading, before existing child content
    expect(result.content.indexOf("After Details.")).toBeLessThan(result.content.indexOf("Some detailed content here."));
    expect(result.lintWarnings).toEqual([]);
  });

  it("appends new list items under a list heading via replaceChildren", async () => {
    const note = "# Groceries\n\n- Milk\n- Eggs\n";
    const patches: SemanticPatch[] = [
      { selector: { nthChild: 1 }, operation: { op: "replaceChildren", value: "- Milk\n- Eggs\n- Bread" } },
    ];
    const result = await applySemanticPatches(note, patches);
    expect(result.content).toContain("Bread");
    expect(result.content).toContain("Milk");
    expect(result.lintWarnings).toEqual([]);
  });

  it("inserts multi-paragraph value after a heading", async () => {
    const patches: SemanticPatch[] = [
      { selector: { heading: "Details" }, operation: { op: "insertAfter", value: "First paragraph.\n\nSecond paragraph." } },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    expect(result.content).toContain("First paragraph.");
    expect(result.content).toContain("Second paragraph.");
    expect(result.lintWarnings).toEqual([]);
  });

  it("returns lint warnings for patches that produce markdown lint issues instead of rejecting", async () => {
    // Producing a broken link which markdownlint should flag
    const patches: SemanticPatch[] = [
      { selector: { heading: "Details" }, operation: { op: "insertAfter", value: "[broken](<>)" } },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    expect(result.lintWarnings.length).toBeGreaterThanOrEqual(1);
    expect(result.lintWarnings[0]).toContain("MD042");
    // Content still contains the text
    expect(result.content).toContain("broken");
  });

  it("replaces a blockquote's content", async () => {
    const note = "# Quote\n\n> Old quote text\n";
    const patches: SemanticPatch[] = [
      { selector: { nthChild: 1 }, operation: { op: "replaceChildren", value: "New quote text" } },
    ];
    const result = await applySemanticPatches(note, patches);
    expect(result.content).toContain("New quote text");
    expect(result.content).not.toContain("Old quote text");
    expect(result.lintWarnings).toEqual([]);
  });

  it("removes a paragraph and verifies the surrounding structure is intact", async () => {
    const note = "# Title\n\nFirst para.\n\n## Mid\n\nContent.\n\nLast para.\n";
    const patches: SemanticPatch[] = [
      { selector: { nthChild: 1 }, operation: { op: "remove" } },
    ];
    const result = await applySemanticPatches(note, patches);
    expect(result.content).not.toContain("First para.");
    expect(result.content).toContain("## Mid");
    expect(result.content).toContain("Last para.");
    expect(result.lintWarnings).toEqual([]);
  });

  it("handles a note with no headings at root level", async () => {
    const note = "Just a plain paragraph with no headings.\n\nAnother paragraph.\n";
    const patches: SemanticPatch[] = [
      { selector: { lastChild: true }, operation: { op: "replace", value: "Replaced." } },
    ];
    const result = await applySemanticPatches(note, patches);
    expect(result.content).toContain("Replaced.");
    expect(result.lintWarnings).toEqual([]);
  });

  it("gives clear diagnostic for headings when no headings exist", async () => {
    const note = "Plain text only.\n";
    const patches: SemanticPatch[] = [
      { selector: { heading: "Something" }, operation: { op: "appendChild", value: "n/a" } },
    ];
    await expect(applySemanticPatches(note, patches)).rejects.toThrow("No headings in document");
  });

  it("replaces a heading via replace operation", async () => {
    const patches: SemanticPatch[] = [
      { selector: { heading: "Details" }, operation: { op: "replace", value: "Replaced heading content." } },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    expect(result.content).toContain("Replaced heading content.");
    expect(result.lintWarnings).toEqual([]);
  });

  it("fails on ambiguous headingStartsWith match (returns first match)", async () => {
    const note = "# Alpha\n\n## Alphabeta\n\nA.\n";
    const patches: SemanticPatch[] = [
      { selector: { headingStartsWith: "Alp" }, operation: { op: "insertAfter", value: "X" } },
    ];
    // Should match the first heading (Alpha), not Alphabeta
    const result = await applySemanticPatches(note, patches);
    expect(result.content.indexOf("X")).toBeLessThan(result.content.indexOf("Alphabeta"));
    expect(result.lintWarnings).toEqual([]);
  });

  it("preserves code blocks through round-trip after patch", async () => {
    const note = "# Code\n\nSome text.\n\n```ts\nconst x = 1;\n```\n\nMore text.\n";
    const patches: SemanticPatch[] = [
      { selector: { nthChild: 0 }, operation: { op: "insertAfter", value: "Inserted after heading." } },
    ];
    const result = await applySemanticPatches(note, patches);
    expect(result.content).toContain("```ts");
    expect(result.content).toContain("const x = 1;");
    expect(result.content).toContain("Inserted after heading.");
    expect(result.lintWarnings).toEqual([]);
  });

  it("throws error when trying to appendChild on a leaf node like code", async () => {
    const note = "# Code\n\n```\ncode\n```\n";
    const patches: SemanticPatch[] = [
      { selector: { nthChild: 1 }, operation: { op: "appendChild", value: "Text" } },
    ];
    await expect(applySemanticPatches(note, patches)).rejects.toThrow("Cannot appendChild");
  });
});
